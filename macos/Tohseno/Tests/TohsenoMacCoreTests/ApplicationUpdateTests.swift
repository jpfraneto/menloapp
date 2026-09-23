import AppKit
import CryptoKit
import Darwin
import Foundation
import SwiftUI
import XCTest
@testable import TohsenoMacCore

@MainActor
final class ApplicationUpdateTests: XCTestCase {
    private func fixture() throws -> PreparedApplicationUpdate {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            .resolvingSymlinksInPath()
        let directory = parent.appendingPathComponent(".menlo-update-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
        addTeardownBlock { try? FileManager.default.removeItem(at: parent) }
        return PreparedApplicationUpdate(
            update: ApplicationUpdate(version: "1.3.0-rc.3", buildNumber: 10014, channel: "release-candidate",
                downloadURL: URL(string: "https://example.com/Menlo-1.3.0-rc.3.dmg")!, sha256: String(repeating: "a", count: 64)),
            directory: directory, destination: parent.appendingPathComponent("Menlo.app"), previousBuildNumber: 10013)
    }

    private func preferences() -> UserDefaults {
        let name = "menlo-update-tests-\(UUID().uuidString)"
        let preferences = UserDefaults(suiteName: name)!
        addTeardownBlock { UserDefaults(suiteName: name)?.removePersistentDomain(forName: name) }
        return preferences
    }

    private func waitFor(_ condition: @MainActor () -> Bool) async throws {
        for _ in 0..<200 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Update state did not arrive")
    }

    func testDownloadReportsProgressCannotDoubleStartAndCanCancel() async throws {
        let prepared = try fixture()
        let installer = UpdateInstallerFixture(prepared: prepared)
        let updater = ApplicationUpdater(checker: UpdateCheckerFixture(update: prepared.update),
                                         installer: installer, preferences: preferences())
        await updater.check()
        XCTAssertEqual(updater.phase, .available)
        updater.download()
        updater.download()
        try await waitFor { updater.phase == .downloading(received: 50, total: 100) }
        let calls = await installer.prepareCalls
        XCTAssertEqual(calls, 1)
        updater.cancelDownload()
        try await waitFor { updater.phase == .available }
        let restarts = await installer.restartCalls
        XCTAssertEqual(restarts, 0)
    }

    func testDownloadFailureOffersRetryAndNeverMarksUpdated() async throws {
        let prepared = try fixture()
        let installer = UpdateInstallerFixture(prepared: prepared)
        await installer.finish(failing: true)
        let updater = ApplicationUpdater(checker: UpdateCheckerFixture(update: prepared.update),
                                         installer: installer, preferences: preferences())
        await updater.check()
        updater.download()
        try await waitFor { if case .failed = updater.phase { true } else { false } }
        await installer.finish(failing: false)
        updater.download()
        try await waitFor { updater.phase == .ready }
        let restarts = await installer.restartCalls
        XCTAssertEqual(restarts, 0)
    }

    func testRestartPreservesExactDraftsAndOnlyMatchingRelaunchSaysUpdated() async throws {
        let prepared = try fixture()
        let preferences = preferences()
        let installer = UpdateInstallerFixture(prepared: prepared)
        await installer.finish()
        let updater = ApplicationUpdater(checker: UpdateCheckerFixture(update: prepared.update),
                                         installer: installer, preferences: preferences)
        await updater.check()
        updater.download()
        try await waitFor { updater.phase == .ready }
        let reference = ReferenceDraft(filename: "image.png", mediaType: "image/png", data: Data([1, 2, 3]), origin: "picked")
        let drafts = ApplicationUpdateDrafts(creation: CreationDraft(name: "My app", intention: "Unsent idea", references: [reference]),
            quickShotIntention: "Another idea", evolutions: ["project": EvolutionDraft(intention: "Unsent change", references: [reference])])
        let data = try JSONEncoder().encode(drafts)
        try await updater.restart(preserving: data)
        XCTAssertEqual(updater.phase, .restarting)
        let restarts = await installer.restartCalls
        XCTAssertEqual(restarts, 1)
        let oldVersion = ApplicationUpdater(preferences: preferences, currentBuildNumber: 10013,
                                            currentApplicationURL: prepared.destination)
        guard case .failed = oldVersion.phase else { return XCTFail("Old app must not claim update success") }
        XCTAssertEqual(oldVersion.restoredDrafts, data)
        let relaunched = ApplicationUpdater(preferences: preferences, currentBuildNumber: 10014, currentVersion: prepared.update.version,
                                            currentApplicationURL: prepared.destination)
        XCTAssertEqual(relaunched.phase, .updated(prepared.update.version))
        let restored = try JSONDecoder().decode(ApplicationUpdateDrafts.self, from: XCTUnwrap(relaunched.restoredDrafts))
        XCTAssertEqual(restored.creation, drafts.creation)
        XCTAssertEqual(restored.quickShotIntention, drafts.quickShotIntention)
        XCTAssertEqual(restored.evolutions, drafts.evolutions)
        relaunched.finishRestoringDrafts()
        XCTAssertFalse(FileManager.default.fileExists(atPath: prepared.directory.path))
    }

    func testCheckFailureIsNotReportedAsUpToDate() async {
        let updater = ApplicationUpdater(checker: UpdateCheckerFixture(update: nil, fails: true), preferences: preferences())
        await updater.check(userInitiated: true)
        guard case .failed = updater.phase else { return XCTFail("Network failure must stay visible") }
        XCTAssertNil(updater.checkMessage)
        let current = ApplicationUpdater(checker: UpdateCheckerFixture(update: nil), preferences: preferences())
        await current.check(userInitiated: true)
        XCTAssertEqual(current.phase, .upToDate)
    }

    func testPreparedDownloadSurvivesQuittingBeforeRestart() async throws {
        let prepared = try fixture()
        try FileManager.default.createDirectory(at: prepared.application, withIntermediateDirectories: false)
        let preferences = preferences()
        let installer = UpdateInstallerFixture(prepared: prepared)
        await installer.finish()
        let updater = ApplicationUpdater(checker: UpdateCheckerFixture(update: prepared.update),
                                         installer: installer, preferences: preferences)
        await updater.check()
        updater.download()
        try await waitFor { updater.phase == .ready }
        let reopened = ApplicationUpdater(checker: UpdateCheckerFixture(update: nil, fails: true),
            installer: installer, preferences: preferences, currentBuildNumber: 10013, currentApplicationURL: prepared.destination)
        XCTAssertEqual(reopened.phase, .ready)
        XCTAssertEqual(reopened.update, prepared.update)
        await reopened.check(userInitiated: true)
        XCTAssertEqual(reopened.phase, .ready)
        let downloads = await installer.prepareCalls
        XCTAssertEqual(downloads, 1)
    }

    func testMetadataRejectsUnsafeArtifactsUnsupportedSystemsAndDowngrades() throws {
        let prepared = try fixture()
        let metadata: [String: Any] = ["schema": "tohseno.macos-distribution/1", "available": true,
            "channel": "release-candidate", "version": prepared.update.version, "build_number": 10014,
            "url": prepared.update.downloadURL.absoluteString, "sha256": prepared.update.sha256, "minimum_macos_version": "14.0"]
        for (key, invalid): (String, Any) in [
            ("schema", "other"), ("available", false), ("channel", "unpublished"),
            ("url", "http://example.com/Menlo.dmg"), ("url", "https://user:password@example.com/Menlo.dmg"),
            ("url", "https://example.com/Menlo.zip"), ("url", "https://example.com/Menlo.dmg#fragment"),
            ("sha256", "not-a-digest"), ("build_number", 0), ("minimum_macos_version", "999.0"),
        ] {
            var invalidMetadata = metadata
            invalidMetadata[key] = invalid
            let data = try JSONSerialization.data(withJSONObject: invalidMetadata)
            XCTAssertThrowsError(try WebsiteApplicationUpdateChecker.availableUpdate(from: data, currentBuildNumber: 10013), key)
        }
        let data = try JSONSerialization.data(withJSONObject: metadata)
        XCTAssertNil(try WebsiteApplicationUpdateChecker.availableUpdate(from: data, currentBuildNumber: 10015))
        XCTAssertEqual(try WebsiteApplicationUpdateChecker.availableUpdate(from: data, currentBuildNumber: 10013), prepared.update)
    }

    func testChecksumRejectsTamperingAndSymbolicLinks() throws {
        let prepared = try fixture()
        let file = prepared.directory.appendingPathComponent("image.dmg")
        let data = Data("exact published bytes".utf8)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        try data.write(to: file)
        XCTAssertNoThrow(try NativeApplicationUpdateInstaller.verifyDigest(of: file, expected: digest))
        try Data("different bytes".utf8).write(to: file)
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.verifyDigest(of: file, expected: digest))
        let link = prepared.directory.appendingPathComponent("link.dmg")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.verifyDigest(of: link, expected: digest))
    }

    func testAtomicReplacementRetainsPreviousBundleAndCanRollBack() throws {
        let prepared = try fixture()
        for (url, contents) in [(prepared.application, "new"), (prepared.destination, "previous")] {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try Data(contents.utf8).write(to: url.appendingPathComponent("contents"))
        }
        try NativeApplicationUpdateInstaller.swapApplications(prepared.application, prepared.destination)
        XCTAssertEqual(try String(contentsOf: prepared.destination.appendingPathComponent("contents"), encoding: .utf8), "new")
        XCTAssertEqual(try String(contentsOf: prepared.application.appendingPathComponent("contents"), encoding: .utf8), "previous")
        try NativeApplicationUpdateInstaller.swapApplications(prepared.application, prepared.destination)
        XCTAssertEqual(try String(contentsOf: prepared.destination.appendingPathComponent("contents"), encoding: .utf8), "previous")
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.swapApplications(prepared.directory.appendingPathComponent("missing"), prepared.destination))
        XCTAssertEqual(try String(contentsOf: prepared.destination.appendingPathComponent("contents"), encoding: .utf8), "previous")
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.verifySignature(prepared.destination))
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.verifySignature(URL(fileURLWithPath: "/System/Applications/TextEdit.app")))
    }

    func testInstallLockAndPrivateStagingPreventCompetingOrRedirectedInstalls() throws {
        let prepared = try fixture()
        let descriptor = try NativeApplicationUpdateInstaller.acquireInstallLock(destination: prepared.destination)
        defer { close(descriptor) }
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.acquireInstallLock(destination: prepared.destination))
        XCTAssertNoThrow(try NativeApplicationUpdateInstaller.validateStagingDirectory(prepared.directory, destination: prepared.destination))
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: prepared.directory.path)
        XCTAssertThrowsError(try NativeApplicationUpdateInstaller.validateStagingDirectory(prepared.directory, destination: prepared.destination))
    }

    func testUpdateScreensRenderFromActualDownloadAndReadinessStates() async throws {
        let prepared = try fixture()
        let installer = UpdateInstallerFixture(prepared: prepared)
        let model = TohsenoAppModel(client: UIFixtureFactoryClient(), preferences: preferences(),
            applicationUpdateChecker: UpdateCheckerFixture(update: prepared.update), applicationUpdateInstaller: installer)
        await model.reload()
        await model.applicationUpdater.check()
        model.applicationUpdater.download()
        try await waitFor { model.applicationUpdater.phase == .downloading(received: 50, total: 100) }
        try render(model, name: "downloading")
        await installer.finish()
        try await waitFor { model.applicationUpdater.phase == .ready }
        XCTAssertNotNil(model.applicationUpdateRestartBlocker)
        await model.restartForApplicationUpdate()
        XCTAssertEqual(model.applicationUpdater.phase, .ready)
        let blockedRestarts = await installer.restartCalls
        XCTAssertEqual(blockedRestarts, 0)
        try render(model, name: "waiting-for-work")

        let idleModel = TohsenoAppModel(client: FakeFactory(), preferences: preferences(),
            applicationUpdateChecker: UpdateCheckerFixture(update: prepared.update), applicationUpdateInstaller: installer)
        await idleModel.reload()
        await idleModel.applicationUpdater.check()
        idleModel.applicationUpdater.download()
        try await waitFor { idleModel.applicationUpdater.phase == .ready }
        XCTAssertNil(idleModel.applicationUpdateRestartBlocker)
        try render(idleModel, name: "ready")
    }

    private func render(_ model: TohsenoAppModel, name: String) throws {
        let view = NSHostingView(rootView: ApplicationUpdateBanner(model: model).frame(width: 900).environment(\.colorScheme, .dark))
        view.frame = NSRect(x: 0, y: 0, width: 900, height: 112)
        view.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in: view.bounds))
        view.cacheDisplay(in: view.bounds, to: bitmap)
        let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
        XCTAssertGreaterThan(png.count, 1_000)
        if let folder = ProcessInfo.processInfo.environment["MENLO_UPDATE_QA_DIR"] {
            try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("update-\(name).png"))
        }
    }

    func testPublishedArtifactDownloadsVerifiesAndReplacesOnlyAnIsolatedCopy() async throws {
        guard let installedPath = ProcessInfo.processInfo.environment["MENLO_UPDATE_TEST_APP"] else {
            throw XCTSkip("Opt-in real download and Gatekeeper check; never replaces the installed app")
        }
        let installed = URL(fileURLWithPath: installedPath)
        let currentBuild = try NativeApplicationUpdateInstaller.buildNumber(at: installed)
        let checker = WebsiteApplicationUpdateChecker(currentBuildNumber: currentBuild)
        let available = try await checker.availableUpdate()
        let update = try XCTUnwrap(available)
        let isolated = try fixture()
        try FileManager.default.copyItem(at: installed, to: isolated.destination)
        let installer = NativeApplicationUpdateInstaller(applicationURL: isolated.destination)
        let prepared = try await installer.prepare(update) { _ in }
        defer { try? FileManager.default.removeItem(at: prepared.directory) }
        XCTAssertEqual(try NativeApplicationUpdateInstaller.buildNumber(at: isolated.destination), currentBuild)
        try NativeApplicationUpdateInstaller.validatePrepared(prepared)
        try NativeApplicationUpdateInstaller.swapApplications(prepared.application, prepared.destination)
        try NativeApplicationUpdateInstaller.verifyApplication(prepared.destination, update: update)
        XCTAssertEqual(try NativeApplicationUpdateInstaller.buildNumber(at: prepared.application), currentBuild)
        XCTAssertEqual(try NativeApplicationUpdateInstaller.buildNumber(at: installed), currentBuild)
        print("Verified live release \(update.version), SHA-256 \(update.sha256), Developer ID, Gatekeeper, and isolated atomic replacement.")
    }
}

private struct UpdateCheckerFixture: ApplicationUpdateChecking {
    let update: ApplicationUpdate?
    var fails = false
    func availableUpdate() async throws -> ApplicationUpdate? {
        if fails { throw ApplicationUpdateError("The network is unavailable.") }
        return update
    }
}

private actor UpdateInstallerFixture: ApplicationUpdateInstalling {
    let prepared: PreparedApplicationUpdate
    var prepareCalls = 0
    var restartCalls = 0
    private var waiting = true
    private var failing = false

    init(prepared: PreparedApplicationUpdate) { self.prepared = prepared }
    func finish(failing: Bool = false) { self.failing = failing; waiting = false }
    func prepare(_ update: ApplicationUpdate,
                 progress: @escaping @MainActor @Sendable (ApplicationUpdatePhase) -> Void) async throws -> PreparedApplicationUpdate {
        prepareCalls += 1
        await progress(.downloading(received: 50, total: 100))
        while waiting { try await Task.sleep(for: .milliseconds(10)) }
        if failing { throw ApplicationUpdateError("Download interrupted") }
        await progress(.verifying)
        return prepared
    }
    @MainActor func restart(_ prepared: PreparedApplicationUpdate) async throws { await recordRestart() }
    private func recordRestart() { restartCalls += 1 }
}
