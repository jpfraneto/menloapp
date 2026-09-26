import SwiftUI
import AppKit

/// The directory's publisher is the person who shared the app. A repository
/// owner can be an organization or a different person; keep those roles distinct.
struct GitHubPublisher: Decodable, Sendable {
    let id: Int
    let login: String
}

struct GitHubMark: View {
    var size: CGFloat = 18

    private static let image: NSImage? = {
        guard let url = MenloBrand.bundle.url(forResource: "github-mark", withExtension: "pdf"),
              let image = NSImage(contentsOf: url) else { return nil }
        image.isTemplate = true
        return image
    }()

    var body: some View {
        if let image = Self.image {
            Image(nsImage: image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        }
    }
}

struct GitHubAvatar: View {
    let login: String
    var userID: Int? = nil
    var size: CGFloat = 28

    private var avatarURL: URL? {
        if let userID, userID > 0 {
            return URL(string: "https://avatars.githubusercontent.com/u/\(userID)?s=160&v=4")
        }
        guard login.range(of: #"^[A-Za-z0-9-]{1,39}$"#, options: .regularExpression) != nil else { return nil }
        return URL(string: "https://github.com/\(login).png?size=160")
    }

    var body: some View {
        AsyncImage(url: avatarURL) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Image(systemName: "person.crop.circle.fill")
                .resizable().scaledToFit()
                .foregroundStyle(TohsenoTheme.textMuted)
                .padding(size * 0.14)
        }
        .frame(width: size, height: size)
        .background(TohsenoTheme.accentSoft)
        .clipShape(Circle())
        .overlay(Circle().stroke(TohsenoTheme.separator, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

struct GitHubRepositoryLink: View {
    let repository: String

    var body: some View {
        Link(destination: URL(string: "https://github.com/\(repository)")!) {
            HStack(spacing: 8) {
                GitHubMark(size: 20)
                Text(repository)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .multilineTextAlignment(.leading)
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(TohsenoTheme.text)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Open \(repository) on GitHub")
        .accessibilityLabel("GitHub repository: \(repository)")
    }
}

struct GitHubSourceIdentity: View {
    let repository: String
    var publisher: GitHubPublisher? = nil

    private var login: String {
        publisher?.login ?? repository.split(separator: "/").first.map(String.init) ?? repository
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GitHubRepositoryLink(repository: repository)
            Link(destination: URL(string: "https://github.com/\(login)")!) {
                HStack(spacing: 8) {
                    GitHubAvatar(login: login, userID: publisher?.id, size: 26)
                    Text(publisher == nil ? "Repository owner" : "Shared by")
                        .foregroundStyle(TohsenoTheme.textMuted)
                    Text("@\(login)")
                        .fontWeight(.medium)
                        .foregroundStyle(TohsenoTheme.text)
                        .lineLimit(1)
                }
                .font(.callout)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("View @\(login) on GitHub")
            .accessibilityLabel("\(publisher == nil ? "Repository owner" : "Shared by") @\(login) on GitHub")
        }
    }
}
