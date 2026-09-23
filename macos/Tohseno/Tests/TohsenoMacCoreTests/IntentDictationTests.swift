import AppKit
import SwiftUI
import XCTest
@testable import TohsenoMacCore

final class IntentDictationTests: XCTestCase {
    func testPartialResultsReviseOnlyTheSpokenSuffix() {
        var transcript = DictationTranscript(initialText: "Keep my notes.\n\n")
        XCTAssertEqual(transcript.receive("Make a", completed: false, startTime: 0, endTime: 0), "Keep my notes.\n\nMake a")
        XCTAssertEqual(transcript.receive("Make a timer", completed: true, startTime: 0, endTime: 1.5), "Keep my notes.\n\nMake a timer")
        XCTAssertEqual(transcript.receive("Make a timer", completed: true, startTime: 0, endTime: 1.5), "Keep my notes.\n\nMake a timer")
        XCTAssertEqual(transcript.receive("", completed: false, startTime: nil, endTime: nil), "Keep my notes.\n\nMake a timer")
    }

    func testPausesKeepEarlierUtterancesAndDoNotDuplicateCumulativeResults() {
        var transcript = DictationTranscript(initialText: "My idea:")
        _ = transcript.receive("A timer.", completed: true, startTime: 0.2, endTime: 1.5)
        XCTAssertEqual(transcript.receive("With a", completed: false, startTime: 2, endTime: 3), "My idea: A timer. With a")
        XCTAssertEqual(transcript.receive("With a bell.", completed: true, startTime: 2, endTime: 4), "My idea: A timer. With a bell.")
        XCTAssertEqual(transcript.receive("With a bell. And", completed: false, startTime: 2, endTime: 5), "My idea: A timer. With a bell. And")
    }

    func testOnDeviceUtteranceBoundariesWorkWithoutTimestamps() {
        var transcript = DictationTranscript(initialText: "")
        _ = transcript.receive("First sentence.", completed: true, startTime: 0, endTime: 0)
        XCTAssertEqual(transcript.receive("Another", completed: false, startTime: 0, endTime: 0), "First sentence. Another")
        XCTAssertEqual(transcript.receive("Another sentence.", completed: true, startTime: 0, endTime: 0), "First sentence. Another sentence.")
    }

    func testShippingBundleIncludesThePermissionsRequiredForDictation() throws {
        let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        func plist(_ path: String) throws -> [String: Any] {
            try XCTUnwrap(PropertyListSerialization.propertyList(
                from: Data(contentsOf: package.appendingPathComponent(path)), format: nil
            ) as? [String: Any])
        }
        let info = try plist("Packaging/Info.plist")
        for key in ["NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription"] {
            XCTAssertFalse(try XCTUnwrap(info[key] as? String).isEmpty)
        }
        XCTAssertEqual(try plist("Packaging/Tohseno.entitlements")["com.apple.security.device.audio-input"] as? Bool, true)
    }

    @MainActor
    func testComposersRenderAtSmallWindowSizesWithoutStartingDictation() async throws {
        let suite = "menlo-composer-fixture-\(UUID())"
        let preferences = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { preferences.removePersistentDomain(forName: suite) }
        let harness = FactoryHarnessOption(
            id: "codex", label: "Codex", installed: true, selected: true,
            authentication: .authenticated,
            models: [FactoryModelOption(id: "gpt-5", label: "GPT-5", isDefault: true)],
            routes: [FactoryRouteOption(id: "local", label: "Local", billing: "none", available: true,
                estimatedAdditionalCostUSD: nil, costEstimation: false)]
        )
        let model = TohsenoAppModel(client: FakeFactory(harnesses: [harness]), preferences: preferences)
        await model.reload()
        model.creation.harness = harness.id
        let app = try XCTUnwrap(model.apps.first)
        model.evolutions[app.id] = EvolutionDraft(harness: harness.id)

        for scheme in [ColorScheme.light, .dark] {
            for route in [AppRoute.library, .create] {
                model.route = route
                let name = route == .library ? "home" : "create"
                try render(TohsenoRootView(model: model), name: name, scheme: scheme, size: NSSize(width: 980, height: 760))
            }
            try render(EvolutionComposerSheet(model: model, app: app, isPresented: .constant(true)),
                name: "evolution", scheme: scheme, size: NSSize(width: 650, height: 550))
        }
        let dictation = IntentDictationController()
        XCTAssertFalse(dictation.isActive)
        XCTAssertNil(dictation.message)
    }

    @MainActor
    private func render<V: View>(_ view: V, name: String, scheme: ColorScheme, size: NSSize) throws {
        let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height)
            .environment(\.colorScheme, scheme).transaction { $0.disablesAnimations = true })
        host.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
        host.frame = NSRect(origin: .zero, size: size)
        host.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
        XCTAssertGreaterThan(png.count, 10_000)
        if let directory = ProcessInfo.processInfo.environment["MENLO_COMPOSER_FIXTURE_DIR"] {
            try png.write(to: URL(fileURLWithPath: directory)
                .appendingPathComponent("\(name)-\(scheme == .dark ? "dark" : "light").png"), options: .atomic)
        }
    }
}
