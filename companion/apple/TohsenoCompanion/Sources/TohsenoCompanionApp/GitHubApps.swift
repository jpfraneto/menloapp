import Foundation
import SwiftUI
import TohsenoCompanionKit

public struct LinkedGitHubApp: Decodable, Identifiable, Sendable {
    public let schema: String
    public let id: String
    public let slug: String
    public let name: String
    public let repository: String
    public let repositoryID: UInt64
    public let headCommit: String
    public var selectedCommit: String?
    public var commit: String { selectedCommit ?? headCommit }
    enum CodingKeys: String, CodingKey {
        case schema, id, slug, name, repository
        case repositoryID = "repository_id"
        case headCommit = "head_commit"
    }
    public static func resolve(_ link: GitHubAppLink) async throws -> Self {
        let url = URL(string: "https://tohseno.com/api/menlo/v1/apps/\(link.slug)")!
        let (data, response) = try await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 20))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count < 1_048_576 else {
            throw TohsenoCompanionError.invalidEncoding("MENLO could not verify this GitHub app. Try again shortly.")
        }
        var app = try JSONDecoder().decode(Self.self, from: data)
        guard app.schema == "menlo.github-app/1", app.slug == link.slug, app.repositoryID == link.repositoryID,
              app.repository.range(of: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"#, options: .regularExpression) != nil
        else { throw TohsenoCompanionError.invalidEncoding("The GitHub repository behind this link changed.") }
        app.selectedCommit = link.commit
        return app
    }
}

struct GitHubLinkSheet: View {
    @Bindable var model: CompanionModel
    let app: LinkedGitHubApp
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 22) {
                Text(app.name).font(.largeTitle.bold())
                Link(app.repository, destination: URL(string: "https://github.com/\(app.repository)")!)
                Text("Commit \(app.commit.prefix(7))").font(.system(.body, design: .monospaced))
                Text("Your paired Mac will download and build this code with your Apple signing identity. Connect this iPhone when the build is ready.")
                Link("Review the source ↗", destination: URL(string: "https://github.com/\(app.repository)/tree/\(app.commit)")!)
                Button("Prepare on my Mac") {
                    Task { await model.requestGitHubApp(slug: app.slug, repositoryID: app.repositoryID, commit: app.commit) }
                }.buttonStyle(.borderedProminent).disabled(model.busy)
                if let notice = model.networkNotice { Text(notice).foregroundStyle(.secondary) }
                Spacer()
            }.padding(24).navigationTitle("Try this app")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { model.linkedGitHubApp = nil } } }
        }
    }
}

struct GitHubInstalledAppView: View {
    @Bindable var model: CompanionModel
    let status: GitHubAppStatus
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text(status.updateSummary).font(.title2.bold())
                Link(status.repository, destination: URL(string: "https://github.com/\(status.repository)")!)
                if let installed = status.installedCommit { Text("On your iPhone: \(installed.prefix(7))").font(.system(.body, design: .monospaced)) }
                if let checked = status.checkedAt { Text("Last checked by your Mac: \(checked)").font(.caption).foregroundStyle(.secondary) }
                if status.hasUpdate || status.installedCommit == nil, let head = status.headCommit {
                    Button(status.installedCommit == nil ? "Prepare on my Mac" : "Update on my Mac") {
                        Task { await model.requestGitHubApp(slug: status.slug, repositoryID: status.repositoryID, commit: head) }
                    }.buttonStyle(.borderedProminent).disabled(model.busy || status.deliveryStatus == "building" || (status.deliveryStatus == "ready_for_iphone" && status.commit == head))
                }
                Text("Your Mac builds the selected commit. Connect and unlock your intended iPhone when it is ready.")
                Link("Give feedback on GitHub ↗", destination: URL(string: "https://github.com/\(status.repository)/issues")!)
                if let notice = model.networkNotice { Text(notice).foregroundStyle(.secondary) }
            }.padding(24)
        }
    }
}

struct GitHubDiscoverView: View {
    @Bindable var model: CompanionModel
    @State private var apps: [GitHubDirectoryApp] = []
    @State private var message: String?
    @State private var entry = ""
    private struct GitHubDirectoryApp: Decodable, Identifiable {
        let id: String
        let slug: String
        let name: String
        let repository: String
    }
    var body: some View {
        NavigationStack {
            List {
                Section("Open an app link") {
                    TextField("https://tohseno.com/your-app", text: $entry)
                    Button("Find app") { Task { await resolve(entry) } }.disabled(entry.isEmpty)
                }
                Section("From GitHub") {
                    ForEach(apps) { app in
                        Button { Task { await resolve(app.slug) } } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(app.name).font(.headline)
                                Text(app.repository).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if apps.isEmpty { Text(message ?? "Apps shared on MENLO will appear here.").foregroundStyle(.secondary) }
                }
                Section {
                    Text("Your Mac builds the source and signs it for your iPhone. You choose when to install updates.")
                    Link("Deploy your app ↗", destination: URL(string: "https://tohseno.com/#install")!)
                    Link("Historical Registry ↗", destination: URL(string: "https://tohseno.com/registry")!)
                }
                if let notice = model.networkNotice { Text(notice).foregroundStyle(.secondary) }
            }.navigationTitle("Apps to try").task { await load() }.refreshable { await load() }
        }
    }
    private func load() async {
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: URL(string: "https://tohseno.com/api/menlo/v1/apps")!, timeoutInterval: 20))
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 1_048_576 else { throw TohsenoCompanionError.transportUnavailable }
            struct Directory: Decodable { let apps: [GitHubDirectoryApp] }
            apps = try JSONDecoder().decode(Directory.self, from: data).apps
            message = nil
        } catch { message = "The app directory is temporarily unavailable. Try again shortly." }
    }
    private func resolve(_ entry: String) async {
        let text = entry.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: text), GitHubAppLink(url) != nil { await model.handleIncomingURL(url); return }
        let slug: String
        if let url = URL(string: text), url.scheme == "https", url.host == "tohseno.com", url.path.split(separator: "/").count == 1 {
            slug = String(url.path.dropFirst())
        } else { slug = text }
        guard slug.count >= 2, slug.count <= 64, slug.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil else { message = "Paste a MENLO app link or its app slug."; return }
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: URL(string: "https://tohseno.com/api/menlo/v1/apps/\(slug)")!, timeoutInterval: 20))
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 1_048_576 else { throw TohsenoCompanionError.transportUnavailable }
            let app = try JSONDecoder().decode(LinkedGitHubApp.self, from: data)
            guard let url = URL(string: "menlo://app/\(app.slug)?commit=\(app.headCommit)&repository=\(app.repositoryID)") else { return }
            await model.handleIncomingURL(url)
        } catch { message = "This GitHub app could not be found. Check the link and try again." }
    }
}
