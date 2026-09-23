import AppKit
import CryptoKit
import Darwin
import Foundation
import Security

public struct PreparedApplicationUpdate: Codable, Sendable {
    let update: ApplicationUpdate
    let directory: URL
    let destination: URL
    let previousBuildNumber: Int
    var application: URL { directory.appendingPathComponent("Payload.app") }
}

public protocol ApplicationUpdateInstalling: Sendable {
    func prepare(
        _ update: ApplicationUpdate,
        progress: @escaping @MainActor @Sendable (ApplicationUpdatePhase) -> Void
    ) async throws -> PreparedApplicationUpdate
    @MainActor func restart(_ prepared: PreparedApplicationUpdate) async throws
}

/// Uses the already-published DMG and the same Apple identity as the native installer.
/// Only the application bundle is replaced; first-open factory activation retains its
/// existing ownership, manifest, and rollback checks.
public struct NativeApplicationUpdateInstaller: ApplicationUpdateInstalling {
    private let applicationURL: URL
    static let maximumDownloadBytes: Int64 = 512 * 1024 * 1024
    static let helperArgument = "--menlo-apply-update"
    static let signingRequirement = "identifier \"com.tohseno.mac\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"84V63LKV45\""

    public init(applicationURL: URL = Bundle.main.bundleURL) {
        self.applicationURL = applicationURL
    }

    public func prepare(
        _ update: ApplicationUpdate,
        progress: @escaping @MainActor @Sendable (ApplicationUpdatePhase) -> Void
    ) async throws -> PreparedApplicationUpdate {
        guard Self.isSecureURL(update.downloadURL), update.downloadURL.pathExtension == "dmg",
              update.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil else {
            throw ApplicationUpdateError("The update download couldn’t be verified.")
        }
        let destination = applicationURL.standardizedFileURL
        try Self.validateDestination(destination)
        let previousBuild = try Self.buildNumber(at: destination)
        guard update.buildNumber > previousBuild else {
            throw ApplicationUpdateError("This update is older than the installed version.")
        }
        let directory = destination.deletingLastPathComponent()
            .appendingPathComponent(".menlo-update-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                                                    attributes: [.posixPermissions: 0o700])
        } catch {
            throw ApplicationUpdateError("Menlo needs permission to update in this folder. Move it to your Applications folder and try again.")
        }
        var retained = false
        defer { if !retained { try? FileManager.default.removeItem(at: directory) } }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 15 * 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let delegate = UpdateDownloadDelegate { received, total in
            Task { @MainActor in progress(.downloading(received: received, total: total)) }
        }
        let (temporary, response) = try await session.download(from: update.downloadURL, delegate: delegate)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let finalURL = http.url, Self.isSecureURL(finalURL) else {
            throw ApplicationUpdateError("The update couldn’t be downloaded. Check your connection and try again.")
        }
        let image = directory.appendingPathComponent("Update.dmg")
        try FileManager.default.moveItem(at: temporary, to: image)
        await progress(.verifying)
        let prepared = PreparedApplicationUpdate(update: update, directory: directory,
                                                 destination: destination, previousBuildNumber: previousBuild)
        let verification = Task.detached {
            try Self.verifyDigest(of: image, expected: update.sha256)
            try Task.checkCancellation()
            let mount = directory.appendingPathComponent("Mount", isDirectory: true)
            try FileManager.default.createDirectory(at: mount, withIntermediateDirectories: false)
            try Self.runTool("/usr/bin/hdiutil", ["attach", image.path, "-readonly", "-nobrowse", "-noautoopen",
                                                 "-mountpoint", mount.path, "-quiet"])
            var mounted = true
            defer {
                if mounted { try? Self.runTool("/usr/bin/hdiutil", ["detach", mount.path, "-quiet"]) }
            }
            try Task.checkCancellation()
            let applications = try FileManager.default.contentsOfDirectory(at: mount, includingPropertiesForKeys: nil)
                .filter { $0.pathExtension == "app" }
            guard applications.count == 1, let source = applications.first else {
                throw ApplicationUpdateError("The update doesn’t contain the expected Menlo app.")
            }
            try Self.verifyApplication(source, update: update)
            try Self.runTool("/usr/bin/ditto", [source.path, prepared.application.path])
            try Self.runTool("/usr/bin/hdiutil", ["detach", mount.path, "-quiet"])
            mounted = false
            try Self.verifyApplication(prepared.application, update: update)
            try Task.checkCancellation()
            try JSONEncoder().encode(prepared).write(to: directory.appendingPathComponent("update.json"), options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: directory.appendingPathComponent("update.json").path)
            // Keep only the verified app; the disk image is no longer needed.
            try FileManager.default.removeItem(at: image)
            return prepared
        }
        let result = try await withTaskCancellationHandler {
            try await verification.value
        } onCancel: { verification.cancel() }
        retained = true
        return result
    }

    @MainActor public func restart(_ prepared: PreparedApplicationUpdate) async throws {
        guard prepared.destination.isFileURL, prepared.destination.path == applicationURL.standardizedFileURL.path else {
            throw ApplicationUpdateError("The update belongs to another copy of Menlo.")
        }
        let executable = prepared.destination.appendingPathComponent("Contents/MacOS/TohsenoMacApp")
        let helper = Process()
        let handshake = UUID().uuidString
        helper.executableURL = executable
        helper.arguments = [Self.helperArgument, prepared.directory.path, String(getpid()), handshake]
        helper.standardInput = FileHandle.nullDevice
        helper.standardOutput = FileHandle.nullDevice
        helper.standardError = FileHandle.nullDevice
        try helper.run()
        let ready = prepared.directory.appendingPathComponent("ready-\(handshake)")
        for _ in 0..<600 {
            if FileManager.default.fileExists(atPath: ready.path) {
                NSApplication.shared.terminate(nil)
                return
            }
            if !helper.isRunning { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        if helper.isRunning { helper.terminate() }
        throw ApplicationUpdateError("Menlo couldn’t prepare the restart. Your current app is unchanged. Try again.")
    }

    /// Runs before SwiftUI starts. The helper uses the current signed executable,
    /// waits for its own parent to exit, then re-verifies and atomically swaps bundles.
    public static func runHelperIfRequested() {
        guard CommandLine.arguments.dropFirst().first == helperArgument else { return }
        guard CommandLine.arguments.count == 5, UUID(uuidString: CommandLine.arguments[4]) != nil,
              let parent = Int32(CommandLine.arguments[3]), parent > 1, parent == getppid() else { exit(1) }
        let directory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true).standardizedFileURL
        let destination = Bundle.main.bundleURL.standardizedFileURL
        do {
            let lock = try acquireInstallLock(destination: destination)
            defer { close(lock) }
            try validateStagingDirectory(directory, destination: destination)
            let prepared = try JSONDecoder().decode(PreparedApplicationUpdate.self,
                from: Data(contentsOf: directory.appendingPathComponent("update.json")))
            guard prepared.directory.isFileURL, prepared.destination.isFileURL,
                  prepared.directory.path == directory.path, prepared.destination.path == destination.path else {
                throw ApplicationUpdateError("The update location changed.")
            }
            try validatePrepared(prepared)
            try Data().write(to: directory.appendingPathComponent("ready-\(CommandLine.arguments[4])"), options: .atomic)
            let deadline = Date().addingTimeInterval(120)
            while kill(parent, 0) == 0 {
                guard Date() < deadline else { exit(1) }
                Thread.sleep(forTimeInterval: 0.1)
            }
            guard errno == ESRCH else { exit(1) }
            do {
                try validatePrepared(prepared)
                try swapApplications(prepared.application, destination)
                do {
                    try runTool("/usr/bin/open", ["-n", destination.path])
                } catch {
                    // An unsuccessful relaunch restores the complete previous app.
                    try swapApplications(prepared.application, destination)
                    throw error
                }
                // The relaunched process removes the backup after it recovers its drafts.
                exit(0)
            } catch {
                try? runTool("/usr/bin/open", ["-n", destination.path])
                exit(1)
            }
        } catch { exit(1) }
    }

    static func isSecureURL(_ url: URL) -> Bool {
        guard let value = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return value.scheme == "https" && value.host?.isEmpty == false
            && value.user == nil && value.password == nil && value.fragment == nil
    }

    static func verifyDigest(of file: URL, expected: String) throws {
        let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size > 0, size <= maximumDownloadBytes else {
            throw ApplicationUpdateError("The update download is incomplete or too large. Try again.")
        }
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            try Task.checkCancellation()
            hash.update(data: chunk)
        }
        guard hash.finalize().map({ String(format: "%02x", $0) }).joined() == expected else {
            throw ApplicationUpdateError("The downloaded update didn’t match the published release. Try downloading it again.")
        }
    }

    static func verifyApplication(_ url: URL, update: ApplicationUpdate) throws {
        try verifySignature(url)
        let info = try infoDictionary(at: url)
        guard info["CFBundleIdentifier"] as? String == "com.tohseno.mac",
              info["CFBundleExecutable"] as? String == "TohsenoMacApp",
              info["CFBundleShortVersionString"] as? String == update.version,
              try buildNumber(at: url) == update.buildNumber,
              let minimum = info["LSMinimumSystemVersion"] as? String,
              WebsiteApplicationUpdateChecker.supportsMacOS(minimum) else {
            throw ApplicationUpdateError("The app inside the download doesn’t match this update.")
        }
        try runTool("/usr/sbin/spctl", ["--assess", "--type", "execute", url.path])
    }

    static func verifySignature(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard values.isDirectory == true, values.isSymbolicLink != true else {
            throw ApplicationUpdateError("The update app is missing or its location is unsafe.")
        }
        var code: SecStaticCode?
        var requirement: SecRequirement?
        let flags = SecCSFlags(rawValue: kSecCSCheckAllArchitectures | kSecCSCheckNestedCode | kSecCSStrictValidate)
        guard SecStaticCodeCreateWithPath(url as CFURL, [], &code) == errSecSuccess,
              SecRequirementCreateWithString(signingRequirement as CFString, [], &requirement) == errSecSuccess,
              let code, let requirement,
              SecStaticCodeCheckValidity(code, flags, requirement) == errSecSuccess else {
            throw ApplicationUpdateError("The Menlo signature couldn’t be verified. Your installed app is unchanged.")
        }
    }

    static func validateDestination(_ url: URL) throws {
        guard url.isFileURL, url.pathExtension == "app", url.path == url.resolvingSymlinksInPath().path,
              !url.path.contains("/AppTranslocation/"),
              try url.resourceValues(forKeys: [.volumeIsReadOnlyKey]).volumeIsReadOnly != true else {
            throw ApplicationUpdateError("Move Menlo to Applications before updating.")
        }
        try verifySignature(url)
    }

    static func validateStagingDirectory(_ directory: URL, destination: URL) throws {
        let values = try FileManager.default.attributesOfItem(atPath: directory.path)
        guard directory.isFileURL, destination.isFileURL,
              directory.deletingLastPathComponent().path == destination.deletingLastPathComponent().path,
              directory.lastPathComponent.hasPrefix(".menlo-update-"),
              UUID(uuidString: String(directory.lastPathComponent.dropFirst(".menlo-update-".count))) != nil,
              directory.path == directory.resolvingSymlinksInPath().path,
              values[.type] as? FileAttributeType == .typeDirectory,
              (values[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              (values[.posixPermissions] as? NSNumber)?.intValue == 0o700 else {
            throw ApplicationUpdateError("The prepared update folder is no longer private.")
        }
    }

    static func validatePrepared(_ prepared: PreparedApplicationUpdate) throws {
        try validateDestination(prepared.destination)
        try validateStagingDirectory(prepared.directory, destination: prepared.destination)
        guard try buildNumber(at: prepared.destination) == prepared.previousBuildNumber,
              prepared.update.buildNumber > prepared.previousBuildNumber else {
            throw ApplicationUpdateError("The installed version changed. Check for updates again.")
        }
        try verifyApplication(prepared.application, update: prepared.update)
    }

    static func swapApplications(_ source: URL, _ destination: URL) throws {
        guard renamex_np(source.path, destination.path, UInt32(RENAME_SWAP)) == 0 else {
            throw ApplicationUpdateError("macOS couldn’t replace Menlo. Your previous app is still installed.")
        }
    }

    static func acquireInstallLock(destination: URL) throws -> Int32 {
        let path = destination.deletingLastPathComponent()
            .appendingPathComponent(".\(destination.lastPathComponent).update-lock").path
        let descriptor = open(path, O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw ApplicationUpdateError("Menlo couldn’t reserve the update.") }
        var info = stat()
        guard fstat(descriptor, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_uid == getuid(),
              flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            close(descriptor)
            throw ApplicationUpdateError("Another copy of Menlo is already updating. Try again when it finishes.")
        }
        return descriptor
    }

    static func infoDictionary(at url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url.appendingPathComponent("Contents/Info.plist"))
        guard let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else {
            throw ApplicationUpdateError("The update app information is invalid.")
        }
        return info
    }

    static func buildNumber(at url: URL) throws -> Int {
        guard let value = try infoDictionary(at: url)["CFBundleVersion"] as? String,
              let build = Int(value), build > 0 else {
            throw ApplicationUpdateError("Menlo couldn’t read the installed version.")
        }
        return build
    }

    static func runTool(_ path: String, _ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        let ended = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in ended.signal() }
        try process.run()
        if ended.wait(timeout: .now() + 60) == .timedOut {
            process.terminate()
            if ended.wait(timeout: .now() + 2) == .timedOut { kill(process.processIdentifier, SIGKILL) }
            throw ApplicationUpdateError("macOS took too long to prepare the update. Try again.")
        }
        guard process.terminationStatus == 0 else {
            throw ApplicationUpdateError("macOS couldn’t verify or prepare this update. Your installed app is unchanged. Try again.")
        }
    }
}

private final class UpdateDownloadDelegate: NSObject, URLSessionDownloadDelegate, Sendable {
    let progress: @Sendable (Int64, Int64?) -> Void
    init(progress: @escaping @Sendable (Int64, Int64?) -> Void) { self.progress = progress }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(request.url.map(NativeApplicationUpdateInstaller.isSecureURL) == true ? request : nil)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesWritten <= NativeApplicationUpdateInstaller.maximumDownloadBytes,
              totalBytesExpectedToWrite <= NativeApplicationUpdateInstaller.maximumDownloadBytes else {
            downloadTask.cancel()
            return
        }
        progress(totalBytesWritten, totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
}
