import Foundation
import XCTest
@testable import TohsenoMacCore

final class MenloListingAssetsTests: XCTestCase {
    func testOnlyPNGAndJPEGCountAsListingImages() {
        XCTAssertTrue(MenloListingAssets.isImage(Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])))
        XCTAssertTrue(MenloListingAssets.isImage(Data([0xFF, 0xD8, 0xFF, 0xE0])))
        XCTAssertFalse(MenloListingAssets.isImage(Data("<html>".utf8)))
        XCTAssertFalse(MenloListingAssets.isImage(Data()))
    }

    func testInvalidSlugsNeverReachTheNetwork() async throws {
        let assets = try await MenloListingAssets.load(slug: "../etc")
        XCTAssertNil(assets.icon)
        XCTAssertNil(assets.screenshot)
    }
}
