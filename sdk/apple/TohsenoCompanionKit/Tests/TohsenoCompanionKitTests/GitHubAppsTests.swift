import Foundation
import XCTest
@testable import TohsenoCompanionKit

final class GitHubAppsTests: XCTestCase {
    func testCommandMatchesRustCanonicalPayloadAndPinsCommit() throws {
        let commit = String(repeating: "a", count: 40)
        let payload = CompanionCommandPayload.githubAppInstall(slug: "test-app", repositoryID: 12, commit: commit)
        try payload.validate()
        XCTAssertEqual(payload.requiredCapability, .networkReceive)
        let canonical = try payload.canonicalValue().data()
        XCTAssertEqual(String(decoding: canonical, as: UTF8.self), "{\"command_kind\":\"github.app.install\",\"commit\":\"\(commit)\",\"repository_id\":12,\"slug\":\"test-app\"}")
        XCTAssertEqual(try JSONDecoder().decode(CompanionCommandPayload.self, from: JSONEncoder().encode(payload)), payload)
        XCTAssertThrowsError(try CompanionCommandPayload.githubAppInstall(slug: "test-app", repositoryID: 12, commit: "main").validate())
    }

    func testStatusDistinguishesPreparedSourceFromInstalledCommit() throws {
        let value: [String: Any] = ["slug": "test-app", "repository_id": 12, "repository": "maker/app", "commit": String(repeating: "b", count: 40),
            "installed_commit": String(repeating: "a", count: 40), "head_commit": String(repeating: "b", count: 40), "commits_behind": 3,
            "comparison_status": "ahead", "checked_at": "2026-09-16T12:00:00Z", "delivery_status": "ready_for_iphone"]
        let status = try JSONDecoder().decode(GitHubAppStatus.self, from: JSONSerialization.data(withJSONObject: value))
        try status.validate()
        XCTAssertTrue(status.hasUpdate)
        XCTAssertNotEqual(status.installedCommit, status.commit)
        XCTAssertTrue(status.updateSummary.contains("connect your iPhone"))
        let url = URL(string: "menlo://app/test-app?commit=\(status.commit)&repository=12")!
        XCTAssertNotNil(GitHubAppLink(url))
        XCTAssertNil(GitHubAppLink(URL(string: url.absoluteString + "&repository=99")!))
    }
}
