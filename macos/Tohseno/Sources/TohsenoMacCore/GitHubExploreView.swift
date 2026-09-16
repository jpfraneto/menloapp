import SwiftUI

struct GitHubListedApp: Decodable, Identifiable, Sendable {
    let id: String
    let slug: String
    let name: String
    let repository: String
    let description: String
}

struct GitHubExploreView: View {
    @Bindable var model: TohsenoAppModel
    @State private var entry = ""
    @State private var apps: [GitHubListedApp] = []
    @State private var message: String?
    @State private var loading = true
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Try an app. Help its maker.").font(.largeTitle.bold())
                Text("Open a MENLO link or find an app below. Your Mac builds the source from GitHub for your own iPhone.")
                HStack {
                    TextField("MENLO app link or slug", text: $entry).textFieldStyle(.roundedBorder)
                        .onSubmit { openEntry() }
                    Button("Open app") { openEntry() }.buttonStyle(.borderedProminent).disabled(entry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if loading { ProgressView("Checking the app directory…") }
                if let message { Text(message).foregroundStyle(.secondary) }
                ForEach(apps) { app in
                    Button { Task { await model.reviewGitHubApp(slug: app.slug) } } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(app.name).font(.title3.bold())
                            Text(app.repository).foregroundStyle(.secondary)
                            if !app.description.isEmpty { Text(app.description) }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
                    }.buttonStyle(.bordered)
                }
                if apps.isEmpty && !loading && message == nil { Text("No GitHub apps have been registered yet. Share the first one with tohseno deploy.").foregroundStyle(.secondary) }
                Divider()
                Link("Deploy your app ↗", destination: URL(string: "https://tohseno.com/#install")!)
                Link("Historical Registry releases ↗", destination: URL(string: "https://tohseno.com/registry")!).font(.caption)
            }.frame(maxWidth: 820, alignment: .leading).padding(36)
        }.task { await refresh() }
    }
    private func openEntry() {
        let text = entry.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: text), GitHubAppLink(url) != nil {
            Task { await model.openNetworkLink(url) }
        } else {
            let slug: String
            if let url = URL(string: text), url.scheme == "https", url.host == "tohseno.com", url.path.split(separator: "/").count == 1 {
                slug = String(url.path.dropFirst())
            } else { slug = text }
            Task { await model.reviewGitHubApp(slug: slug) }
        }
    }
    private func refresh() async {
        defer { loading = false }
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: URL(string: "https://tohseno.com/api/menlo/v1/apps")!, timeoutInterval: 20))
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 1_048_576 else { throw FactoryClientError.transport("The GitHub app directory is temporarily unavailable.") }
            struct Directory: Decodable { let apps: [GitHubListedApp] }
            apps = try JSONDecoder().decode(Directory.self, from: data).apps
        } catch { message = error.localizedDescription }
    }
}
