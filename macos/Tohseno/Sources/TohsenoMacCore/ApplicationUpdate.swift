import Foundation
import Observation

public struct ApplicationUpdate: Codable, Equatable, Sendable {
    public let version: String
    public let buildNumber: Int
    public let channel: String
    public let downloadURL: URL
    public let sha256: String

    public init(version: String, buildNumber: Int, channel: String, downloadURL: URL, sha256: String) {
        self.version = version
        self.buildNumber = buildNumber
        self.channel = channel
        self.downloadURL = downloadURL
        self.sha256 = sha256
    }
}

public protocol ApplicationUpdateChecking: Sendable {
    func availableUpdate() async throws -> ApplicationUpdate?
}

public struct WebsiteApplicationUpdateChecker: ApplicationUpdateChecking {
    private let endpoint: URL
    private let currentBuildNumber: Int
    private let urlSession: URLSession

    public init(
        endpoint: URL = URL(string: "https://tohseno.com/api/distribution/v1/macos")!,
        currentBuildNumber: Int? = nil,
        urlSession: URLSession? = nil
    ) {
        self.endpoint = endpoint
        self.currentBuildNumber = currentBuildNumber
            ?? Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "")
            ?? 0
        if let urlSession {
            self.urlSession = urlSession
        } else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            configuration.timeoutIntervalForRequest = 6
            self.urlSession = URLSession(configuration: configuration)
        }
    }

    public func availableUpdate() async throws -> ApplicationUpdate? {
        var request = URLRequest(url: endpoint)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 6
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              http.url == endpoint, http.url?.scheme == "https", data.count <= 64 * 1024 else {
            throw ApplicationUpdateError("Menlo couldn’t check for updates. Try again in a moment.")
        }
        return try Self.availableUpdate(from: data, currentBuildNumber: currentBuildNumber)
    }

    static func availableUpdate(
        from data: Data,
        currentBuildNumber: Int
    ) throws -> ApplicationUpdate? {
        guard let projection = try? JSONDecoder().decode(DistributionProjection.self, from: data),
              projection.schema == "tohseno.macos-distribution/1",
              projection.available,
              ["release-candidate", "stable"].contains(projection.channel),
              projection.buildNumber > 0,
              projection.version.range(
                of: #"^\d+\.\d+\.\d+(?:-rc\.\d+)?$"#,
                options: .regularExpression
              ) != nil,
              projection.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
              let artifactURL = URL(string: projection.url),
              let components = URLComponents(url: artifactURL, resolvingAgainstBaseURL: false),
              components.scheme == "https",
              components.host != nil,
              components.user == nil,
              components.password == nil,
              components.fragment == nil,
              components.query == nil,
              artifactURL.pathExtension == "dmg" else {
            throw ApplicationUpdateError("The update information couldn’t be verified. Try again later.")
        }
        guard projection.buildNumber > currentBuildNumber else { return nil }
        guard Self.supportsMacOS(projection.minimumMacOSVersion) else {
            throw ApplicationUpdateError("This update needs macOS \(projection.minimumMacOSVersion) or later.")
        }
        return ApplicationUpdate(
            version: projection.version,
            buildNumber: projection.buildNumber,
            channel: projection.channel,
            downloadURL: artifactURL,
            sha256: projection.sha256
        )
    }

    static func supportsMacOS(_ version: String) -> Bool {
        guard version.range(of: #"^[0-9]+\.[0-9]+(?:\.[0-9]+)?$"#, options: .regularExpression) != nil else { return false }
        let parts = version.split(separator: ".").compactMap { Int($0) }
        guard (2...3).contains(parts.count), parts.count == version.split(separator: ".").count,
              parts.allSatisfy({ $0 >= 0 }) else { return false }
        return ProcessInfo.processInfo.isOperatingSystemAtLeast(
            OperatingSystemVersion(majorVersion: parts[0], minorVersion: parts[1], patchVersion: parts.count == 3 ? parts[2] : 0)
        )
    }
}

private struct DistributionProjection: Decodable, Sendable {
    let schema: String
    let available: Bool
    let channel: String
    let version: String
    let buildNumber: Int
    let url: String
    let sha256: String
    let minimumMacOSVersion: String

    enum CodingKeys: String, CodingKey {
        case schema
        case available
        case channel
        case version
        case buildNumber = "build_number"
        case url
        case sha256
        case minimumMacOSVersion = "minimum_macos_version"
    }
}

struct ApplicationUpdateError: LocalizedError, Sendable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

public enum ApplicationUpdatePhase: Equatable, Sendable {
    case idle, checking, upToDate, available, verifying, cancelling, ready, restarting
    case downloading(received: Int64, total: Int64?)
    case updated(String)
    case failed(String)

    var isBusy: Bool {
        switch self {
        case .checking, .downloading, .verifying, .cancelling, .restarting: true
        default: false
        }
    }
}

struct ApplicationUpdateDrafts: Codable {
    let creation: CreationDraft
    let quickShotIntention: String
    let evolutions: [String: EvolutionDraft]
}

@MainActor @Observable
public final class ApplicationUpdater {
    public private(set) var update: ApplicationUpdate?
    public private(set) var phase: ApplicationUpdatePhase = .idle
    public private(set) var checkMessage: String?
    private(set) var restoredDrafts: Data?
    private let checker: any ApplicationUpdateChecking
    private let installer: any ApplicationUpdateInstalling
    private let preferences: UserDefaults
    private var prepared: PreparedApplicationUpdate?
    private var downloadTask: Task<Void, Never>?
    private var downloadID: UUID?
    private var checking = false
    private var previousPreparation: PreparedApplicationUpdate?
    private static let pendingKey = "menlo.application-update.pending"
    private static let readyKey = "menlo.application-update.ready"

    public init(
        checker: any ApplicationUpdateChecking = WebsiteApplicationUpdateChecker(),
        installer: any ApplicationUpdateInstalling = NativeApplicationUpdateInstaller(),
        preferences: UserDefaults = .standard,
        currentBuildNumber: Int? = nil,
        currentVersion: String? = nil,
        currentApplicationURL: URL = Bundle.main.bundleURL
    ) {
        self.checker = checker
        self.installer = installer
        self.preferences = preferences
        let build = currentBuildNumber ?? Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0
        if let data = preferences.data(forKey: Self.pendingKey),
           let pending = try? JSONDecoder().decode(PreparedApplicationUpdate.self, from: data),
           pending.destination.isFileURL, pending.destination.path == currentApplicationURL.standardizedFileURL.path,
           (try? NativeApplicationUpdateInstaller.validateStagingDirectory(pending.directory, destination: pending.destination)) != nil {
            let version = currentVersion ?? Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
            phase = build == pending.update.buildNumber && version == pending.update.version
                ? .updated(pending.update.version)
                : .failed("The update didn’t finish. Your previous version is still available. Try again.")
            restoredDrafts = try? Data(contentsOf: pending.directory.appendingPathComponent("drafts.json"))
            previousPreparation = pending
        } else if let data = preferences.data(forKey: Self.readyKey),
                  let saved = try? JSONDecoder().decode(PreparedApplicationUpdate.self, from: data),
                  saved.destination.isFileURL, saved.destination.path == currentApplicationURL.standardizedFileURL.path,
                  saved.previousBuildNumber == build, saved.update.buildNumber > build,
                  (try? NativeApplicationUpdateInstaller.validateStagingDirectory(saved.directory, destination: saved.destination)) != nil,
                  FileManager.default.fileExists(atPath: saved.application.path) {
            prepared = saved
            update = saved.update
            phase = .ready
        }
    }

    public func check(userInitiated: Bool = false) async {
        guard !checking, !phase.isBusy, prepared == nil else { return }
        checking = true
        defer { checking = false }
        let previous = phase
        phase = .checking
        do {
            update = try await checker.availableUpdate()
            checkMessage = update == nil ? "You’re up to date." : nil
            if update != nil { phase = .available }
            else if case .updated = previous { phase = previous }
            else if case .failed = previous, !userInitiated { phase = previous }
            else { phase = userInitiated ? .upToDate : .idle }
        } catch {
            if userInitiated { phase = .failed(error.localizedDescription) }
            else { phase = previous }
        }
    }

    public func download() {
        guard let update, !phase.isBusy, prepared == nil else { return }
        phase = .downloading(received: 0, total: nil)
        let identifier = UUID()
        downloadID = identifier
        checkMessage = nil
        downloadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await installer.prepare(update) { [weak self] progress in
                    guard let self, self.downloadID == identifier, !Task.isCancelled else { return }
                    // Late URLSession progress must never overwrite verification or readiness.
                    if case .downloading = self.phase { self.phase = progress }
                }
                if Task.isCancelled {
                    try? FileManager.default.removeItem(at: result.directory)
                    phase = .available
                } else {
                    preferences.set(try JSONEncoder().encode(result), forKey: Self.readyKey)
                    prepared = result
                    phase = .ready
                }
            } catch {
                phase = Task.isCancelled ? .available : .failed(error.localizedDescription)
            }
            downloadTask = nil
            downloadID = nil
        }
    }

    public func cancelDownload() {
        guard downloadTask != nil else { return }
        phase = .cancelling
        downloadTask?.cancel()
    }

    public func restart(preserving drafts: Data) async throws {
        guard let prepared, phase == .ready else { return }
        phase = .restarting
        do {
            try drafts.write(to: prepared.directory.appendingPathComponent("drafts.json"), options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600],
                ofItemAtPath: prepared.directory.appendingPathComponent("drafts.json").path)
            preferences.set(try JSONEncoder().encode(prepared), forKey: Self.pendingKey)
            // Flush before the helper is allowed to replace and relaunch this process.
            preferences.synchronize()
            try await installer.restart(prepared)
        } catch {
            preferences.removeObject(forKey: Self.pendingKey)
            phase = .ready
            throw error
        }
    }

    public func dismissNotice() {
        if case .updated = phase { phase = .idle }
        if phase == .upToDate { phase = .idle }
        if case .failed = phase { phase = update == nil ? .idle : .available }
    }

    func finishRestoringDrafts() {
        guard let previousPreparation else { return }
        // This is executed by the relaunched app, after recovering the saved drafts.
        // The helper never deletes the previous app merely because `open` returned.
        try? FileManager.default.removeItem(at: previousPreparation.directory)
        preferences.removeObject(forKey: Self.pendingKey)
        preferences.removeObject(forKey: Self.readyKey)
        self.previousPreparation = nil
        restoredDrafts = nil
    }
}
