import Foundation

public struct GitHubAppStatus: Codable, Equatable, Sendable {
    public let slug: String
    public let repositoryID: UInt64
    public let repository: String
    public let commit: String
    public let installedCommit: String?
    public let headCommit: String?
    public let commitsBehind: UInt64?
    public let comparisonStatus: String
    public let checkedAt: String?
    public let deliveryStatus: String

    public var hasUpdate: Bool {
        guard let installedCommit, let headCommit, comparisonStatus != "unavailable" else { return false }
        return installedCommit != headCommit
    }
    public var updateSummary: String {
        if deliveryStatus == "ready_for_iphone" { return "Build complete · connect your iPhone" }
        if deliveryStatus == "building" { return "Building on your Mac" }
        if deliveryStatus == "failed" { return "Build needs attention on your Mac" }
        if installedCommit == nil { return "Not installed on your iPhone yet" }
        if comparisonStatus == "unavailable" { return "Couldn’t check GitHub · try again later" }
        if let commitsBehind, comparisonStatus == "ahead" || comparisonStatus == "identical" {
            return commitsBehind == 0 ? "Up to date when last checked" : "\(commitsBehind) commit\(commitsBehind == 1 ? "" : "s") behind"
        }
        if comparisonStatus == "diverged" || comparisonStatus == "behind" { return "GitHub history changed · review the update" }
        return "Checking GitHub for updates"
    }
}

public struct GitHubApp: Codable, Equatable, Sendable, Identifiable {
    public let schema: String
    public let id: String
    public let slug: String
    public let repositoryID: UInt64
    public let repository: String
    public let name: String
    public let project: String
    public let scheme: String
    public let headCommit: String
    public let publicURL: String
}

public struct GitHubInstallResult: Decodable, Sendable {
    public let schema: String
    public let projectID: String
    public let slug: String
    public let commit: String
    public let status: String
    public let sourcePath: String
}

public struct GitHubReview: Identifiable, Sendable {
    public let app: GitHubApp
    public let commit: String
    public var reasons: String?
    public var id: String { "\(app.repositoryID)-\(commit)" }
}

public struct GitHubAppLink: Equatable, Sendable {
    public let slug: String
    public let repositoryID: UInt64
    public let commit: String
    public init?(_ url: URL) {
        guard ["menlo", "tohseno"].contains(url.scheme?.lowercased() ?? ""), url.host == "app",
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              url.path.split(separator: "/").count == 1,
              let slug = url.path.split(separator: "/").first.map(String.init), slug.count >= 2, slug.count <= 64,
              slug.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              query.count == 2, query.filter({ $0.name == "commit" }).count == 1,
              query.filter({ $0.name == "repository" }).count == 1,
              let commit = query.first(where: { $0.name == "commit" })?.value,
              commit.range(of: #"^[a-f0-9]{40}$"#, options: .regularExpression) != nil,
              let value = query.first(where: { $0.name == "repository" })?.value,
              let repositoryID = UInt64(value), repositoryID > 0, repositoryID <= 9_007_199_254_740_991
        else { return nil }
        self.slug = slug; self.repositoryID = repositoryID; self.commit = commit
    }
}

/// A GitHub app's public listing art from menloapp.lol: the icon and first
/// screenshot the web page shows. The local runtime only has a placeholder for
/// imported apps, so the Mac shows the same public images as the link.
public enum MenloListingAssets {
    private struct Listing: Decodable {
        let head_commit: String?
        let icon_url: String?
        let presentation: Presentation?
        struct Presentation: Decodable { let screenshots: [String]? }
    }

    private static let base = "https://menloapp.lol/api/menlo/v1/apps/"
    private static let maximumImageBytes = 10 * 1024 * 1024

    public static func load(slug: String, session: URLSession = .shared) async throws -> (icon: Data?, screenshot: Data?) {
        guard slug.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              let url = URL(string: base + slug) else { return (nil, nil) }
        let (data, response) = try await session.data(for: URLRequest(url: url, timeoutInterval: 20))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return (nil, nil) }
        let listing = try JSONDecoder().decode(Listing.self, from: data)
        let icon = await image(listing.icon_url.flatMap(URL.init(string:)), session: session)
        var screenshotURL: URL?
        if let commit = listing.head_commit, commit.range(of: #"^[a-f0-9]{40}$"#, options: .regularExpression) != nil,
           let path = listing.presentation?.screenshots?.first {
            let encoded = path.split(separator: "/").map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? "" }.joined(separator: "/")
            screenshotURL = URL(string: "\(base)\(slug)/media/\(commit)/\(encoded)")
        }
        return (icon, await image(screenshotURL, session: session))
    }

    private static func image(_ url: URL?, session: URLSession) async -> Data? {
        guard let url, url.scheme == "https", url.host == "menloapp.lol",
              let (data, response) = try? await session.data(for: URLRequest(url: url, timeoutInterval: 30)),
              (response as? HTTPURLResponse)?.statusCode == 200,
              data.count <= maximumImageBytes, isImage(data) else { return nil }
        return data
    }

    /// PNG or JPEG only, matching what Menlo listings accept.
    static func isImage(_ data: Data) -> Bool {
        data.starts(with: [0x89, 0x50, 0x4E, 0x47]) || data.starts(with: [0xFF, 0xD8, 0xFF])
    }
}
