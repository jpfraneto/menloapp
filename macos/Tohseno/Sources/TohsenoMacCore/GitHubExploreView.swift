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
    @State private var openingAppID: String?
    @State private var openingLink = false
    @FocusState private var linkFocused: Bool

    private var isOpening: Bool { openingLink || openingAppID != nil || model.githubBusy }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Discover").font(.largeTitle.bold())
                    Text("Apps, person to person.")
                        .font(.title3).foregroundStyle(TohsenoTheme.textMuted)
                }
                appLinkEntry
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("From the community").font(.headline)
                        Spacer()
                        Button { Task { await refresh() } } label: {
                            Image(systemName: "arrow.clockwise")
                                .frame(width: 28, height: 28)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(TohsenoTheme.textMuted)
                        .disabled(loading)
                        .help("Refresh apps")
                        .accessibilityLabel("Refresh apps")
                    }
                    directory
                }
                VStack(alignment: .leading, spacing: 14) {
                    Divider().overlay(TohsenoTheme.separator)
                    HStack {
                        Text("Made something of your own?").foregroundStyle(TohsenoTheme.textMuted)
                        Link("Share your app ↗", destination: URL(string: "https://menloapp.lol/#deploy")!)
                    }
                    .font(.callout)
                    Link("Historical Registry releases ↗", destination: URL(string: "https://menloapp.lol/registry")!)
                        .font(.caption).foregroundStyle(TohsenoTheme.textMuted)
                }
            }
            .frame(maxWidth: 820, alignment: .leading)
            .padding(32)
            .frame(maxWidth: .infinity)
        }
        .background(TohsenoTheme.canvas)
        .task { await refresh() }
    }

    private var appLinkEntry: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Have an app link?").font(.headline)
            HStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "link").foregroundStyle(TohsenoTheme.textMuted)
                    TextField("https://menloapp.lol/anky", text: $entry)
                        .textFieldStyle(.plain)
                        .focused($linkFocused)
                        .onSubmit { openEntry() }
                        .accessibilityLabel("Menlo app link or slug")
                        .accessibilityIdentifier("discover.app-link")
                }
                .padding(12)
                .background(TohsenoTheme.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(linkFocused ? TohsenoTheme.accent : TohsenoTheme.controlBorder,
                                lineWidth: linkFocused ? 2 : 1)
                }
                Button(action: openEntry) {
                    HStack(spacing: 7) {
                        if openingLink { ProgressView().controlSize(.small) }
                        Text(openingLink ? "Opening…" : "Open app")
                    }
                    .frame(minHeight: 20)
                }
                .buttonStyle(PrimaryActionStyle())
                .disabled(isOpening || entry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("discover.open-link")
            }
            Text("Paste a Menlo link or enter a short name, like “anky”. You’ll review the app before building it for your iPhone.")
                .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var directory: some View {
        if loading {
            HStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Checking the app directory…")
                    .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
            }
            .frame(maxWidth: .infinity, minHeight: apps.isEmpty ? 120 : 36)
        }
        if let message {
            VStack(alignment: .leading, spacing: 8) {
                Label("Couldn’t load apps", systemImage: "wifi.exclamationmark").font(.headline)
                Text(message).font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                Button("Try again") { Task { await refresh() } }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(TohsenoTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        }
        ForEach(apps) { app in
            Button { openApp(app) } label: {
                HStack(alignment: .top, spacing: 16) {
                    Text(String(app.name.prefix(1)).uppercased())
                        .font(MenloTypography.brand(size: 25))
                        .foregroundStyle(TohsenoTheme.accent)
                        .frame(width: 48, height: 48)
                        .background(TohsenoTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(app.name).font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(TohsenoTheme.text)
                        Text(app.repository).font(.caption).foregroundStyle(TohsenoTheme.textMuted)
                        if !app.description.isEmpty {
                            Text(app.description).font(.callout)
                                .foregroundStyle(TohsenoTheme.textMuted)
                                .lineLimit(2)
                                .padding(.top, 3)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if openingAppID == app.id {
                        ProgressView().controlSize(.small)
                            .accessibilityLabel("Opening \(app.name)")
                    } else {
                        Image(systemName: "chevron.right")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(TohsenoTheme.textMuted)
                            .accessibilityHidden(true)
                    }
                }
                .padding(18)
                .contentShape(Rectangle())
            }
            .buttonStyle(DiscoverAppStyle())
            .disabled(isOpening)
            .help("Review \(app.name)")
            .accessibilityHint("Review this app before building it for your iPhone")
            .accessibilityIdentifier("discover.app.\(app.slug)")
        }
        if apps.isEmpty && !loading && message == nil {
            VStack(spacing: 8) {
                Image(systemName: "square.grid.2x2").font(.title2)
                Text("The first app could be yours.").font(.headline)
                Text("Share your app, or open a Menlo link above.").font(.callout)
            }
            .foregroundStyle(TohsenoTheme.textMuted)
            .frame(maxWidth: .infinity, minHeight: 140)
        }
    }

    private func openApp(_ app: GitHubListedApp) {
        guard !isOpening else { return }
        openingAppID = app.id
        Task {
            defer { openingAppID = nil }
            await model.reviewGitHubApp(slug: app.slug)
        }
    }

    private func openEntry() {
        let text = entry.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isOpening else { return }
        openingLink = true
        Task {
            defer { openingLink = false }
            if let url = URL(string: text), GitHubAppLink(url) != nil {
                await model.openNetworkLink(url)
            } else {
                let slug: String
                if let url = URL(string: text), url.scheme == "https", ["menloapp.lol", "tohseno.com"].contains(url.host ?? ""), url.path.split(separator: "/").count == 1 {
                    slug = String(url.path.dropFirst())
                } else { slug = text }
                await model.reviewGitHubApp(slug: slug)
            }
        }
    }

    private func refresh() async {
        loading = true
        message = nil
        defer { loading = false }
        do {
            let (data, response) = try await URLSession.shared.data(for: URLRequest(url: URL(string: "https://menloapp.lol/api/menlo/v1/apps")!, timeoutInterval: 20))
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 1_048_576 else { throw FactoryClientError.transport("The GitHub app directory is temporarily unavailable.") }
            struct Directory: Decodable { let apps: [GitHubListedApp] }
            apps = try JSONDecoder().decode(Directory.self, from: data).apps
        } catch { message = error.localizedDescription }
    }
}

private struct DiscoverAppStyle: ButtonStyle {
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .multilineTextAlignment(.leading)
            .background(isHovered || configuration.isPressed ? TohsenoTheme.accentSoft : TohsenoTheme.surface,
                        in: RoundedRectangle(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isHovered ? TohsenoTheme.controlBorder : TohsenoTheme.separator)
            }
            .onHover { isHovered = $0 }
    }
}
