//! GitHub distribution is an off-chain product path, not a Registry release.
use crate::living_project::{AdoptionRequest, LivingProjectRecord, LivingProjectService};
use crate::service_client::ServiceClient;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tohseno_engine::{Event, EventBus};
use tohseno_network::catalog::BuildSafetyClassification;

type BoxError = Box<dyn std::error::Error + Send + Sync>;
const ORIGIN: &str = "https://tohseno.com";
pub static GITHUB_OPERATIONS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitHubOrigin {
    pub slug: String,
    pub repository_id: u64,
    pub repository: String,
    pub commit: String,
    pub source_root: String,
    pub source_digest: String,
    pub installed_commit: Option<String>,
    pub head_commit: Option<String>,
    pub commits_behind: Option<u64>,
    pub comparison_status: String,
    pub checked_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GitHubApp {
    pub schema: String,
    pub id: String,
    pub slug: String,
    pub repository_id: u64,
    pub repository: String,
    pub name: String,
    pub project: String,
    pub scheme: String,
    pub head_commit: String,
    pub public_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitHubInstallRequest {
    pub slug: String,
    pub repository_id: u64,
    pub commit: String,
    #[serde(default)]
    pub approve_mac_review: bool,
}

pub fn valid_commit(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn valid_slug(value: &str) -> bool {
    (2..=64).contains(&value.len())
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn valid_repository(value: &str) -> bool {
    let parts: Vec<_> = value.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part.len() <= 100
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        })
}
pub fn validate_request(request: &GitHubInstallRequest) -> Result<(), BoxError> {
    if !valid_slug(&request.slug)
        || !valid_commit(&request.commit)
        || request.repository_id == 0
        || request.repository_id > 9_007_199_254_740_991
    {
        return Err("Choose one MENLO app and its exact GitHub commit".into());
    }
    Ok(())
}
impl GitHubOrigin {
    pub fn validate(&self) -> Result<(), BoxError> {
        validate_request(&GitHubInstallRequest {
            slug: self.slug.clone(),
            repository_id: self.repository_id,
            commit: self.commit.clone(),
            approve_mac_review: false,
        })?;
        if !valid_repository(&self.repository)
            || !Path::new(&self.source_root).is_absolute()
            || self
                .installed_commit
                .as_deref()
                .is_some_and(|s| !valid_commit(s))
            || self
                .head_commit
                .as_deref()
                .is_some_and(|s| !valid_commit(s))
        {
            return Err("Invalid private GitHub source identity".into());
        }
        tohseno_protocol::digest::Bytes32::from_hex("GitHub source digest", &self.source_digest)?;
        Ok(())
    }
    pub fn local_bundle_identifier(&self) -> String {
        format!("app.menlo.github.r{}", self.repository_id)
    }
}
async fn get_json<T: serde::de::DeserializeOwned>(url: String) -> Result<T, BoxError> {
    use futures_util::StreamExt;
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()?
        .get(url)
        .send()
        .await?;
    let status = response.status();
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("MENLO response is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
        return Err(value
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("MENLO could not check GitHub. Try again shortly.")
            .to_owned()
            .into());
    }
    Ok(serde_json::from_slice(&bytes)?)
}
pub async fn resolve(slug: &str) -> Result<GitHubApp, BoxError> {
    if !valid_slug(slug) {
        return Err("Use the app slug from its MENLO link".into());
    }
    let app: GitHubApp = get_json(format!("{ORIGIN}/api/menlo/v1/apps/{slug}")).await?;
    let path = Path::new(&app.project);
    if app.schema != "menlo.github-app/1"
        || app.slug != slug
        || app.repository_id == 0
        || !valid_repository(&app.repository)
        || !valid_commit(&app.head_commit)
        || path.is_absolute()
        || !path
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        || !matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("xcodeproj" | "xcworkspace")
        )
        || app.scheme.is_empty()
        || app.scheme.len() > 128
        || app.scheme.starts_with('-')
        || app.scheme.chars().any(char::is_control)
    {
        return Err("MENLO returned an invalid GitHub app identity or build recipe".into());
    }
    Ok(app)
}

async fn git(root: &Path, args: &[&str]) -> Result<String, BoxError> {
    let output = tokio::time::timeout(
        Duration::from_secs(180),
        tokio::process::Command::new("git")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .args([
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "protocol.file.allow=never",
                "-c",
                "core.autocrlf=false",
                "-c",
                "credential.helper=",
            ])
            .arg("-C")
            .arg(root)
            .args(args)
            .stdin(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await??;
    if !output.status.success() {
        return Err("Git could not retrieve or verify this exact public commit. Check the repository and your connection; existing source was kept.".into());
    }
    if output.stdout.len() > 16 * 1024 * 1024 {
        return Err("Git source listing is too large".into());
    }
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}

pub async fn verify_checkout(root: &Path, commit: &str) -> Result<String, BoxError> {
    if std::fs::symlink_metadata(root)?.file_type().is_symlink() || !root.join(".git").is_dir() {
        return Err("GitHub source folder is not a private Git checkout".into());
    }
    if git(root, &["rev-parse", "HEAD"]).await? != commit
        || !git(
            root,
            &[
                "status",
                "--porcelain",
                "--untracked-files=all",
                "--ignored=matching",
            ],
        )
        .await?
        .is_empty()
    {
        return Err("This downloaded source has local edits. They were preserved; move the edited folder before retrying this commit.".into());
    }
    let listing = git(root, &["ls-tree", "-r", "-z", commit]).await?;
    let mut entries = Vec::new();
    for record in listing.split('\0').filter(|value| !value.is_empty()) {
        let (metadata, name) = record.split_once('\t').ok_or("Invalid Git source entry")?;
        if !metadata.starts_with("100644 blob ") && !metadata.starts_with("100755 blob ") {
            return Err("This repository uses symbolic links or submodules. Resolve them into ordinary source before sharing through MENLO.".into());
        }
        let path = root.join(name);
        if !std::fs::symlink_metadata(&path)?.is_file()
            || !path.canonicalize()?.starts_with(root.canonicalize()?)
        {
            return Err("The GitHub checkout contains an indirect source path".into());
        }
        let bytes = std::fs::read(&path)?;
        entries.push(tohseno_protocol::tree_hash::SourceTreeEntry {
            path: name.into(),
            content_sha256: tohseno_protocol::digest::sha256(&bytes),
        });
    }
    git(root, &["fsck", "--strict", "--no-reflogs"]).await?;
    Ok(tohseno_protocol::tree_hash::hash_entries(&entries)?.to_string())
}

pub async fn install(
    projects: &LivingProjectService,
    request: GitHubInstallRequest,
) -> Result<LivingProjectRecord, BoxError> {
    validate_request(&request)?;
    let _operation = GITHUB_OPERATIONS.lock().await;
    let app = resolve(&request.slug).await?;
    if request.repository_id != app.repository_id {
        return Err(
            "This link now refers to a different GitHub repository. Open the app page again."
                .into(),
        );
    }
    let repository = get_github_metadata(&app.repository, None).await?;
    if repository.get("id").and_then(|v| v.as_u64()) != Some(request.repository_id)
        || repository.get("private").and_then(|v| v.as_bool()) != Some(false)
    {
        return Err(
            "GitHub repository identity or visibility changed. Installation stopped.".into(),
        );
    }
    // The user approved the commit, not a mutable branch. Confirm it belongs to this repo.
    let commit: serde_json::Value =
        get_github_metadata(&app.repository, Some(&request.commit)).await?;
    if commit.get("sha").and_then(|v| v.as_str()) != Some(&request.commit) {
        return Err("GitHub returned a different commit".into());
    }
    let branch = repository
        .get("default_branch")
        .and_then(|v| v.as_str())
        .ok_or("GitHub default branch is unavailable")?;
    let branch_head = get_github_metadata(&app.repository, Some(branch)).await?;
    let head = branch_head
        .get("sha")
        .and_then(|v| v.as_str())
        .filter(|v| valid_commit(v))
        .ok_or("GitHub returned an invalid branch head")?;
    if request.commit != head {
        let comparison = get_github_path(&format!(
            "/repos/{}/compare/{}...{}?per_page=1",
            app.repository, request.commit, head
        ))
        .await?;
        if comparison.get("status").and_then(|v| v.as_str()) != Some("ahead") {
            return Err("This commit is no longer on the maker's default branch. Open their MENLO page and review the current version.".into());
        }
    }
    let home = PathBuf::from(std::env::var_os("HOME").ok_or("HOME is not set")?);
    let parent = home
        .join("Developer/Menlo")
        .join(format!("{}-{}", app.slug, app.repository_id));
    std::fs::create_dir_all(&parent)?;
    let target = parent.join(&request.commit);
    if !target.exists() {
        let temp = tempfile::Builder::new()
            .prefix(".download-")
            .tempdir_in(&parent)?;
        git(temp.path(), &["init", "--quiet"]).await?;
        let remote = format!("https://github.com/{}.git", app.repository);
        git(temp.path(), &["remote", "add", "origin", &remote]).await?;
        git(
            temp.path(),
            &["fetch", "--depth=1", "--no-tags", "origin", &request.commit],
        )
        .await?;
        // Inspect Git objects before checkout can materialize any symlinks.
        let entries = git(temp.path(), &["ls-tree", "-r", &request.commit]).await?;
        if entries
            .lines()
            .any(|line| line.starts_with("120000 ") || line.starts_with("160000 "))
        {
            return Err("Symbolic links and submodules need manual source review before MENLO can import this app.".into());
        }
        git(temp.path(), &["checkout", "--detach", &request.commit]).await?;
        verify_checkout(temp.path(), &request.commit).await?;
        std::fs::rename(temp.path(), &target)?;
    }
    let digest = verify_checkout(&target, &request.commit).await?;
    let container = target.join(&app.project);
    if !container
        .canonicalize()?
        .starts_with(target.canonicalize()?)
    {
        return Err("The Xcode project escapes its GitHub checkout".into());
    }
    let safety = tohseno_network::build_profile::classify_xcode_project(&target, &container)?;
    if safety.classification == BuildSafetyClassification::Unsupported {
        return Err(format!(
            "This app needs build setup before personal installation: {}",
            safety.reasons.join("; ")
        )
        .into());
    }
    if safety.classification == BuildSafetyClassification::RequiresMacReview
        && !request.approve_mac_review
    {
        return Err(format!("Requires review on your Mac: {}. Source: {}. Review it, then approve this exact commit to build.", safety.reasons.join("; "), target.display()).into());
    }
    let prior = projects.list_projects()?.into_iter().find(|p| {
        p.github_origin
            .as_ref()
            .is_some_and(|g| g.repository_id == app.repository_id)
    });
    let origin = GitHubOrigin {
        slug: app.slug,
        repository_id: app.repository_id,
        repository: app.repository,
        commit: request.commit,
        source_root: target.display().to_string(),
        source_digest: digest,
        installed_commit: prior
            .as_ref()
            .and_then(|p| p.github_origin.as_ref()?.installed_commit.clone()),
        head_commit: Some(app.head_commit),
        commits_behind: None,
        comparison_status: "unchecked".into(),
        checked_at: None,
    };
    let adoption = AdoptionRequest {
        path: container.display().to_string(),
        scheme: Some(app.scheme),
        harness: None,
        model: None,
        network_origin: None,
        github_origin: Some(origin),
    };
    let adoption_service = projects.clone();
    let result = tokio::task::spawn_blocking(move || adoption_service.adoption(adoption)).await??;
    let project = result
        .project
        .ok_or("Choose the iOS application scheme before installing")?;
    projects
        .install_network_project(&project.project_id, request.approve_mac_review)
        .await
}

async fn get_github_metadata(
    repository: &str,
    commit: Option<&str>,
) -> Result<serde_json::Value, BoxError> {
    let mut url = reqwest::Url::parse(&format!("https://api.github.com/repos/{repository}"))?;
    if let Some(commit) = commit {
        url.path_segments_mut()
            .map_err(|_| "Invalid GitHub URL")?
            .push("commits")
            .push(commit);
    }
    get_github_path(url.path()).await
}

async fn get_github_path(path: &str) -> Result<serde_json::Value, BoxError> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()?
        .get(format!("https://api.github.com{path}"))
        .header("User-Agent", "menlo-distribution")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err("GitHub could not verify this public commit. Try again shortly.".into());
    }
    use futures_util::StreamExt;
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err("GitHub response is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes)?)
}

pub async fn receive(
    slug: &str,
    commit: Option<&str>,
    repository_id: Option<u64>,
    approved: bool,
    json_output: bool,
    bus: &EventBus,
) -> Result<(), BoxError> {
    let app = resolve(slug).await?;
    let request = GitHubInstallRequest {
        slug: app.slug,
        repository_id: repository_id.unwrap_or(app.repository_id),
        commit: commit.unwrap_or(&app.head_commit).into(),
        approve_mac_review: approved,
    };
    validate_request(&request)?;
    let service = ServiceClient::ensure_running().await?;
    let project: LivingProjectRecord = crate::network_commands::xcode_request(
        &service,
        "/api/v1/github/install",
        &request,
        "Downloading the selected GitHub commit, then building for your iPhone…",
        bus,
    )
    .await
    .map_err(|e| e.to_string())?;
    let status = project
        .network_delivery
        .as_ref()
        .map(|d| d.status.as_str())
        .unwrap_or("source_ready");
    if json_output {
        println!(
            "{}",
            serde_json::to_string(
                &json!({ "schema": "menlo.github-install-result/1", "project_id": project.project_id, "slug": request.slug, "commit": request.commit, "status": status, "source_path": project.source_path })
            )?
        );
    } else {
        bus.emit(Event::result(match status {
            "installed" => "Installed on your iPhone.",
            "ready_for_iphone" => {
                "Built and signed. Connect and unlock your intended iPhone to install the update."
            }
            _ => "The source is saved. Open MENLO to finish preparing this app.",
        }));
    }
    if status == "failed" {
        return Err(project
            .network_delivery
            .and_then(|d| d.failure)
            .unwrap_or_else(|| "Xcode build failed; source and logs were kept".into())
            .into());
    }
    Ok(())
}

#[derive(Deserialize)]
struct Comparison {
    schema: String,
    repository_id: u64,
    base_commit: String,
    head_commit: String,
    status: String,
    commits_behind: Option<u64>,
    checked_at: String,
}
pub async fn refresh_updates(projects: &LivingProjectService) -> Result<(), BoxError> {
    for project in projects.list_projects()? {
        let Some(origin) = project.github_origin else {
            continue;
        };
        let Some(base) = origin.installed_commit.as_ref() else {
            continue;
        };
        let result = get_json::<Comparison>(format!(
            "{ORIGIN}/api/menlo/v1/apps/{}/compare?base={base}",
            origin.slug
        ))
        .await;
        let mut updated = origin.clone();
        match result {
            Ok(value)
                if value.schema == "menlo.github-comparison/1"
                    && value.repository_id == origin.repository_id
                    && value.base_commit == *base
                    && valid_commit(&value.head_commit) =>
            {
                updated.head_commit = Some(value.head_commit);
                updated.commits_behind = if matches!(value.status.as_str(), "ahead" | "identical") {
                    value.commits_behind
                } else {
                    None
                };
                updated.comparison_status = value.status;
                updated.checked_at = Some(value.checked_at);
            }
            _ => {
                updated.commits_behind = None;
                updated.comparison_status = "unavailable".into();
            }
        }
        projects.update_github_comparison(&project.project_id, &origin, &updated)?;
    }
    Ok(())
}

pub fn deploy(args: &[String]) -> Result<(), BoxError> {
    // Keep relative JavaScript imports beside the embedded entrypoint. Running
    // github.js on stdin would resolve them against the user's app directory.
    let modules = tempfile::Builder::new()
        .prefix("menloapp-deploy-")
        .tempdir()?;
    for (name, source) in [
        (
            "github.js",
            include_str!("../../packages/cli/src/github.js"),
        ),
        (
            "deploy-ui.js",
            include_str!("../../packages/cli/src/deploy-ui.js"),
        ),
        (
            "presentation.js",
            include_str!("../../packages/cli/src/presentation.js"),
        ),
        (
            "project-presentation.js",
            include_str!("../../packages/cli/src/project-presentation.js"),
        ),
        (
            "record.js",
            include_str!("../../packages/cli/src/record.js"),
        ),
    ] {
        std::fs::write(modules.path().join(name), source)?;
    }
    std::fs::write(modules.path().join("package.json"), r#"{"type":"module"}"#)?;
    let entry = modules.path().join("deploy.mjs");
    std::fs::write(&entry, "import { deploy } from './github.js';\ntry { process.exitCode = await deploy(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }\n")?;
    let node = ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
        .into_iter()
        .find(|p| Path::new(p).is_file())
        .unwrap_or("node");
    let mut command = std::process::Command::new(node);
    if args.iter().any(|argument| argument == "--json") {
        command.env("MENLO_NONINTERACTIVE", "1");
    }
    let status = command
        .arg(entry)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|_| "Install Node.js (the npm runtime), then run menloapp deploy again")?;
    if !status.success() {
        return Err("MENLO deployment did not complete. See the action above.".into());
    }
    Ok(())
}

pub fn now() -> String {
    OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .expect("whole second")
        .format(&Rfc3339)
        .expect("valid timestamp")
}

#[derive(Serialize, Deserialize)]
struct GitHubJob {
    request: GitHubInstallRequest,
    status: String,
    failure: Option<String>,
}
pub fn enqueue(
    root: &Path,
    command_id: &str,
    request: GitHubInstallRequest,
) -> Result<(), BoxError> {
    validate_request(&request)?;
    if command_id.is_empty()
        || command_id.len() > 160
        || !command_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        || request.approve_mac_review
    {
        return Err("Invalid private GitHub command".into());
    }
    let directory = root.join("github-jobs-v1");
    crate::network_commands::ensure_private_directory(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!("{command_id}.json"));
    if path.exists() {
        let job: GitHubJob =
            crate::network_commands::read_private_json(&path, 16_384).map_err(|e| e.to_string())?;
        if serde_json::to_value(&job.request)? != serde_json::to_value(&request)? {
            return Err("GitHub request idempotency conflict".into());
        }
        return Ok(());
    }
    crate::network_commands::write_new_private(
        &path,
        &serde_json::to_vec(&GitHubJob {
            request,
            status: "queued".into(),
            failure: None,
        })?,
    )
    .map_err(|e| e.to_string().into())
}

pub async fn resume_jobs(root: &Path, projects: &LivingProjectService) -> Result<(), BoxError> {
    let directory = root.join("github-jobs-v1");
    let entries = match std::fs::read_dir(&directory) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let mut job: GitHubJob =
            crate::network_commands::read_private_json(&path, 16_384).map_err(|e| e.to_string())?;
        if !matches!(job.status.as_str(), "queued" | "processing") {
            continue;
        }
        job.status = "processing".into();
        crate::network_commands::write_replace_private(&path, &serde_json::to_vec(&job)?)
            .map_err(|e| e.to_string())?;
        let result = install(projects, job.request.clone()).await;
        let detail = match result {
            Ok(project) => {
                let delivery = project.network_delivery.as_ref();
                if delivery.is_some_and(|d| d.status == "failed") {
                    job.status = "failed".into();
                    job.failure = delivery.and_then(|d| d.failure.clone());
                    "The Mac could not build this commit. Open MENLO on your Mac to review the failure.".to_string()
                } else {
                    job.status = "completed".into();
                    if delivery.is_some_and(|d| d.status == "installed") {
                        "Installed on your iPhone.".into()
                    } else {
                        "Built on your Mac. Connect and unlock your intended iPhone to install."
                            .into()
                    }
                }
            }
            Err(error) => {
                job.status = "failed".into();
                let message: String = error.to_string().chars().take(1000).collect();
                job.failure = Some(message.clone());
                message
            }
        };
        crate::network_commands::write_replace_private(&path, &serde_json::to_vec(&job)?)
            .map_err(|e| e.to_string())?;
        private_notice(
            root,
            tohseno_companion::event::PrivateUpdateKind::GithubPreparation,
            &job.request.slug,
            &job.request.commit,
            "GitHub app preparation",
            &detail,
        )?;
        break;
    }
    Ok(())
}

fn private_notice(
    root: &Path,
    kind: tohseno_companion::event::PrivateUpdateKind,
    subject: &str,
    evidence: &str,
    title: &str,
    detail: &str,
) -> Result<(), BoxError> {
    use tohseno_companion::event::{PrivateUpdateItem, PRIVATE_UPDATE_ITEM_SCHEMA};
    let id = PrivateUpdateItem::stable_id(kind, subject, evidence);
    if crate::workspace_service::load_private_updates(root)
        .map_err(|e| e.to_string())?
        .items
        .iter()
        .any(|item| item.update_id == id)
    {
        return Ok(());
    }
    let detail: String = detail
        .char_indices()
        .take_while(|(i, _)| *i < 480)
        .map(|(_, c)| c)
        .collect();
    crate::workspace_service::upsert_private_update(
        root,
        PrivateUpdateItem {
            schema: PRIVATE_UPDATE_ITEM_SCHEMA.into(),
            update_id: PrivateUpdateItem::stable_id(kind, subject, evidence),
            kind,
            subject_id: subject.into(),
            evidence_id: evidence.into(),
            title: title.chars().take(100).collect(),
            detail,
            occurred_at: now(),
            read_at: None,
        },
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_notices(root: &Path, projects: &LivingProjectService) -> Result<(), BoxError> {
    for project in projects.list_projects()? {
        let Some(origin) = project.github_origin else {
            continue;
        };
        if let (Some(count), Some(head)) =
            (origin.commits_behind.filter(|n| *n > 0), origin.head_commit)
        {
            private_notice(root, tohseno_companion::event::PrivateUpdateKind::GithubAppUpdated, &project.project_id, &head,
                &format!("{} has an update", project.display_name), &format!("Your installed app is {count} commits behind GitHub. Open the app to update it."))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_deploy_loads_embedded_javascript_modules() {
        super::deploy(&["--help".into()]).unwrap();
    }
    use super::*;
    #[tokio::test]
    async fn checkout_verification_preserves_edits_and_rejects_links() {
        let root = tempfile::tempdir().unwrap();
        let run = |args: &[&str]| {
            let result = std::process::Command::new("git")
                .arg("-C")
                .arg(root.path())
                .args([
                    "-c",
                    "user.name=MENLO Test",
                    "-c",
                    "user.email=test@example.invalid",
                ])
                .args(args)
                .output()
                .unwrap();
            assert!(result.status.success());
            String::from_utf8(result.stdout).unwrap().trim().to_owned()
        };
        run(&["init", "--quiet"]);
        std::fs::write(root.path().join("App.swift"), "let version = 1\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "Initial"]);
        let commit = run(&["rev-parse", "HEAD"]);
        let digest = verify_checkout(root.path(), &commit).await.unwrap();
        assert!(digest.starts_with("0x"));
        std::fs::write(root.path().join("App.swift"), "my local changes\n").unwrap();
        assert!(verify_checkout(root.path(), &commit)
            .await
            .unwrap_err()
            .to_string()
            .contains("local edits"));
        assert_eq!(
            std::fs::read_to_string(root.path().join("App.swift")).unwrap(),
            "my local changes\n"
        );
        run(&["add", "."]);
        run(&["commit", "-qm", "Edit"]);
        assert!(verify_checkout(root.path(), &commit).await.is_err());
        std::os::unix::fs::symlink("/tmp", root.path().join("link")).unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "Link"]);
        let link_commit = run(&["rev-parse", "HEAD"]);
        assert!(verify_checkout(root.path(), &link_commit)
            .await
            .unwrap_err()
            .to_string()
            .contains("symbolic links"));
    }

    #[test]
    fn companion_queue_is_idempotent_and_cannot_bypass_mac_review() {
        let root = tempfile::tempdir().unwrap();
        let request = GitHubInstallRequest {
            slug: "test-app".into(),
            repository_id: 12,
            commit: "a".repeat(40),
            approve_mac_review: false,
        };
        enqueue(root.path(), "command_test", request.clone()).unwrap();
        enqueue(root.path(), "command_test", request.clone()).unwrap();
        let mut changed = request.clone();
        changed.commit = "b".repeat(40);
        assert!(enqueue(root.path(), "command_test", changed).is_err());
        let mut approved = request;
        approved.approve_mac_review = true;
        assert!(enqueue(root.path(), "command_other", approved).is_err());
    }
    #[test]
    fn source_identity_never_accepts_paths_or_mutable_refs() {
        assert!(valid_slug("test-app"));
        for slug in ["../app", "app?x=1", "app--x", "-app"] {
            assert!(!valid_slug(slug));
        }
        assert!(!valid_commit("main"));
        assert!(!valid_commit(&"A".repeat(40)));
        assert!(valid_commit(&"a".repeat(40)));
        assert!(!valid_repository("owner/../app"));
    }
}
