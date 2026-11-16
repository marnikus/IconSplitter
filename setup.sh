#!/usr/bin/env bash
#
# setup.sh — connect Claude Code, OpenCode, and/or Codex directly to the
# Arena Router, or undo it.
#
# This does NOT install the arenarouter npm package or any `arena`
# wrapper command. Setup edits each tool's own user config in place.
#
# Files this script may create or edit:
#   ~/.arena/token                        the Arena Router token (0600), shared by every tool
#   ~/.arena/install-state.json           ownership/restore receipt (0600), one section per tool
#   ~/.arena/install-transaction.json     crash-recovery journal (temporary, 0600)
#   ~/.arena/claude-api-key-helper.sh     helper script Claude Code and Codex call for the token
#   ~/.claude/settings.json               Claude Code config
#   ~/.claude/settings.json.arena-backup  private recovery copy when settings predate Arena
#   ~/.config/opencode/opencode.json      OpenCode global config (provider.arena, model, small_model)
#   ~/.codex/config.toml                  Codex config (model, model_provider,
#                                         model_catalog_json, [model_providers.arena] and its auth command)
#   ~/.arena/codex-models.json            generated catalog for the caller's enabled models
#
# The install-state receipt records the exact original and installed values.
# Re-running retains the original baseline. Uninstall restores a value only
# while it still equals what Arena wrote, so later user changes survive.
# Shared files are restored with the last tool; a token still referenced by
# preserved OpenCode settings, or a helper still referenced by preserved Codex
# settings, stays in place.
#
# Usage:
#   curl -fsSL <portal-url>/setup.sh | bash
#   Interactive menu: setup, update models or uninstall; no other arguments are needed.
#   Setup detects installed tools and lets you pick; uninstall lists what the
#   receipt owns and lets you pick. ARENA_SETUP_HARNESSES=claude,opencode,codex
#   preselects either menu for unattended runs.
#
# Defaults to https://api.arena.ai and the
# coding-router-preview router alias;
# override with ARENA_BASE_URL / ARENA_DEFAULT_MODEL / ARENA_PORTAL_URL:
#   curl -fsSL <portal-url>/setup.sh | ARENA_DEFAULT_MODEL=my-model bash

set -u

# ---------------------------------------------------------------------------
# Constants. Keep these in sync if the Arena Router's defaults ever change.
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL="https://api.arena.ai"
DEFAULT_MODEL="coding-router-preview"
PORTAL_URL="https://platform.arena.ai/dashboard/keys"
# Codex sits behind a per-environment switch while the gateway's Responses
# translation catches up. The portal rewrites this line when it serves the
# script, from SETUP_CODEX_ENABLED or ?codex=1 on the /setup.sh URL. With 0,
# setup neither lists nor accepts Codex; uninstall still honours a receipt
# that already carries a Codex section.
CODEX_ENABLED="1"
ARENA_DIR="$HOME/.arena"
TOKEN_FILE="$ARENA_DIR/token"
CLAUDE_HELPER="$ARENA_DIR/claude-api-key-helper.sh"
STATE_FILE="$ARENA_DIR/install-state.json"
TRANSACTION_FILE="$ARENA_DIR/install-transaction.json"

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

bold() { printf '\033[1m%s\033[0m' "$1"; }
green() { printf '\033[32m%s\033[0m' "$1"; }
yellow() { printf '\033[33m%s\033[0m' "$1"; }
red() { printf '\033[31m%s\033[0m' "$1"; }

# All message helpers collapse $HOME to ~ so paths stay short.
TILDE='~'
detilde() { printf '%s' "${1//$HOME/$TILDE}"; }

info() { printf '%s\n' "$(detilde "$1")"; }
step() { printf '\n%s\n' "$(bold "$1")"; }
warn() { printf '%s %s\n' "$(yellow "warning:")" "$(detilde "$1")" >&2; }
fail() { printf '%s %s\n' "$(red "error:")" "$(detilde "$1")" >&2; }
ok() { printf '%s %s\n' "$(green "✓")" "$(detilde "$1")"; }

CHANGES=()
note_change() { CHANGES+=("$1"); }
SETUP_WRITES_STARTED=0
COMPLETED_SETUP_TOOLS=""

report_completed_setup() {
  if [ -n "$COMPLETED_SETUP_TOOLS" ]; then
    warn "Already configured: $COMPLETED_SETUP_TOOLS. Run setup again to finish, or choose uninstall to undo it."
  fi
}

# Configuration prompts run before writes. Prompts often
# run inside $(...) command substitution, where `exit` would only leave the
# subshell, so they signal the main shell and it runs on_cancel.
on_cancel() {
  trap - TERM
  cleanup_staged_token 2>/dev/null || true
  printf '\n' >&2
  if [ "$SETUP_WRITES_STARTED" = "1" ]; then
    warn "Setup interrupted. Run setup again to recover any unfinished write."
    report_completed_setup
  else
    info "Nothing changed."
  fi
  exit 130
}
request_cancel() {
  printf 'cancelled\n' >&2
  kill -TERM "$$" 2>/dev/null
}

# Ask a yes/no question. $1 = prompt text, $2 = default ("y" or "n").
# Echoes "y" or "n" on stdout; the prompt itself goes to stderr so
# `$(confirm ...)` command substitution only captures the answer.
confirm() {
  local prompt="$1" default="${2:-y}" hint reply
  if [ "$default" = "y" ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" != "1" ] && [ -t 0 ]; then
    # Single keypress, like the menus: Enter takes the default, y/n answer,
    # Esc, q, or Ctrl-D mean no. Echo the choice so the transcript reads well.
    while true; do
      printf '%s %s ' "$(detilde "$prompt")" "$hint" >&2
      IFS= read -rsn1 reply || { request_cancel; echo "n"; return; }
      case "$reply" in
        "") printf '%s\n' "$default" >&2; echo "$default"; return ;;
        y|Y) printf 'y\n' >&2; echo "y"; return ;;
        n|N) printf 'n\n' >&2; echo "n"; return ;;
        q|Q|$'\x1b'|$'\x04') request_cancel; echo "n"; return ;;
        *) printf '\n' >&2 ;;
      esac
    done
  fi
  while true; do
    printf '%s %s ' "$(detilde "$prompt")" "$hint" >&2
    read -r reply || { echo "$default"; return; }
    reply="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')"
    case "$reply" in
      "") echo "$default"; return ;;
      y|yes) echo "y"; return ;;
      n|no) echo "n"; return ;;
      q|$'\x1b'|$'\x04') request_cancel; echo "n"; return ;;
      *) info "Please answer y or n." >&2 ;;
    esac
  done
}

# After a lone ESC, wait briefly for the rest of an arrow-key sequence. bash 4+
# takes fractional seconds; macOS's bash 3.2 only whole seconds.
escape_wait() {
  if [ "${BASH_VERSINFO[0]:-3}" -ge 4 ]; then printf '0.2'; else printf '1'; fi
}

expanduser() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# Populate base_url / default_model from the receipt URL or environment,
# falling back to the script defaults.
set_runtime_config() {
  base_url="${1:-${ARENA_BASE_URL:-$DEFAULT_BASE_URL}}"
  base_url="${base_url%/}"
  default_model="${ARENA_DEFAULT_MODEL:-$DEFAULT_MODEL}"
  # The keys-page link is stamped from the portal that served this script.
  # When ARENA_BASE_URL points elsewhere (a staging gateway), the matching
  # portal usually differs too; ARENA_PORTAL_URL also selects model discovery.
  if [ -n "${ARENA_PORTAL_URL:-}" ]; then
    PORTAL_URL="${ARENA_PORTAL_URL%/}/dashboard/keys"
  elif [ "$base_url" != "$DEFAULT_BASE_URL" ]; then
    local portal
    portal="$(portal_for_gateway "$base_url")"
    if [ -n "$portal" ]; then
      PORTAL_URL="$portal/dashboard/keys"
    else
      fail "No matching portal is known for $base_url. Set ARENA_PORTAL_URL to that gateway's portal before supplying a token."
      return 1
    fi
  fi
}

# Known gateway → portal pairs keep model discovery, the key link and undo
# command in the same environment. Unknown overrides require an explicit portal.
portal_for_gateway() {
  case "$1" in
    https://api.arena.ai|https://api.preview.arena.ai) printf 'https://platform.arena.ai' ;;
    https://api-gateway.staging.spicyarena.ai|https://api-gateway-k8s.staging.spicyarena.ai)
      printf 'https://gateway.staging.spicyarena.ai' ;;
    http://localhost:9200) printf 'http://localhost:3200' ;;
    *) printf '' ;;
  esac
}

# Hold the same macOS/Linux fcntl lock across every mutating step, including
# receipt-less legacy cleanup. A small child process owns the lock while this
# Bash process performs prompts and invokes the transactional Python helper.
# The kernel releases it if either process crashes.
#
# Two FIFOs replace polling. The child reports LOCKED/BUSY/ERROR on the status
# FIFO, which this shell reads with a bounded blocking read. The lifetime FIFO
# is held open for writing by this shell (fd 3) and read by the child; the
# read returns end-of-file when the shell exits, so the child releases the
# lock without ever checking whether its parent is still alive.
INSTALLER_LOCK_PID=""
acquire_installer_lock() {
  local lock_dir state
  lock_dir="$(mktemp -d /tmp/arena-setup-lock.XXXXXX)" || {
    fail "could not create installer lock directory"
    return 1
  }
  if ! mkfifo "$lock_dir/status" "$lock_dir/lifetime"; then
    rm -rf "$lock_dir"
    fail "could not create installer lock pipes"
    return 1
  fi
  # Open both FIFOs read-write here so neither side ever blocks on open().
  exec 3<>"$lock_dir/lifetime" 4<>"$lock_dir/status"
  python3 - "$ARENA_DIR" "$lock_dir/status" "$lock_dir/lifetime" <<'PYEOF' 3>&- 4>&- &
import fcntl, hashlib, os, stat, sys

arena_dir, status_path, lifetime_path = sys.argv[1], sys.argv[2], sys.argv[3]
identity = os.path.realpath(arena_dir).encode()
suffix = hashlib.sha256(identity).hexdigest()[:24]
lock_path = f"/tmp/arena-setup-{os.getuid()}-{suffix}.lock"
flags = os.O_CREAT | os.O_RDWR
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW

def publish(value):
    # A FIFO, not a file: fsync is meaningless here and Linux rejects it with
    # EINVAL, which would turn a successful LOCKED report into an early exit.
    with open(status_path, "w", encoding="utf-8") as handle:
        handle.write(value + "\n")
        handle.flush()

try:
    descriptor = os.open(lock_path, flags, 0o600)
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
        raise RuntimeError("lock is not a private regular file")
    os.fchmod(descriptor, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        publish("BUSY")
        sys.exit(73)
    # Open the lifetime pipe before reporting, so the shell can unlink the
    # FIFO right after the handshake. The shell is its only writer; this read
    # returns at end-of-file when the shell exits, releasing the lock.
    lifetime = open(lifetime_path, "rb")
    publish("LOCKED")
    lifetime.read()
except Exception as exc:
    try:
        publish("ERROR " + str(exc))
    except BaseException:
        pass
    sys.exit(1)
PYEOF
  INSTALLER_LOCK_PID=$!

  # Bounded blocking read: the child answers within milliseconds; the timeout
  # only matters when python3 itself fails to start. bash 3.2 accepts whole
  # seconds here.
  state=""
  IFS= read -r -t 15 state <&4 || state=""
  exec 4<&-
  rm -rf "$lock_dir"
  case "$state" in
    LOCKED)
      export ARENA_SETUP_LOCK_HELD=1
      if [ -n "${ARENA_SETUP_TEST_LOCK_READY_FILE:-}" ]; then
        printf '%s\n' "$INSTALLER_LOCK_PID" > "$ARENA_SETUP_TEST_LOCK_READY_FILE"
      fi
      if [ -n "${ARENA_SETUP_TEST_HOLD_LOCK_SECONDS:-}" ]; then
        sleep "$ARENA_SETUP_TEST_HOLD_LOCK_SECONDS"
      fi
      return 0
      ;;
    BUSY)
      fail "another Arena setup or uninstall is already running for this home"
      ;;
    ERROR\ *)
      fail "could not acquire installer lock: ${state#ERROR }"
      ;;
    *)
      fail "could not acquire installer lock"
      ;;
  esac
  INSTALLER_LOCK_PID=""
  return 1
}

release_installer_lock() {
  # Closing fd 3 ends the lifetime pipe; the child sees end-of-file and exits.
  # The kill is belt and braces for a child stuck before its read.
  exec 3<&- 2>/dev/null || true
  if [ -n "$INSTALLER_LOCK_PID" ]; then
    kill "$INSTALLER_LOCK_PID" 2>/dev/null || true
    wait "$INSTALLER_LOCK_PID" 2>/dev/null || true
  fi
  INSTALLER_LOCK_PID=""
  unset ARENA_SETUP_LOCK_HELD
}

run_mutating_action() {
  acquire_installer_lock || return 1
  "$@"
  local rc=$?
  release_installer_lock
  return "$rc"
}

# Setup or uninstall? Arrow-key single-select on a TTY, plain prompt when
# stdin is piped. Prints the selected action on stdout.
choose_action() {
  if [ "${ARENA_SETUP_ACTION:-}" = "sync" ]; then echo "sync"; return; fi
  if [ ! -t 0 ]; then
    local reply
    printf 'What do you want to do? [setup/update models/uninstall] (Enter = setup): ' >&2
    read -r reply || reply=""
    case "$reply" in
      u|uninstall) echo "uninstall" ;;
      sync|"update models") echo "sync" ;;
      *) echo "setup" ;;
    esac
    return
  fi

  local cur=0 i n key rest marker
  local -a labels=("setup      — connect your coding tools to the Arena Router" \
                   "uninstall  — remove what setup added" \
                   "update models — refresh models for installed tools")
  n=${#labels[@]}
  printf 'What do you want to do? (↑/↓ move · enter select · esc cancel)\n' >&2
  while true; do
    for ((i = 0; i < n; i++)); do
      if [ "$i" -eq "$cur" ]; then marker="$(bold "❯")"; else marker=" "; fi
      printf '  %s %s\033[K\n' "$marker" "${labels[$i]}" >&2
    done
    IFS= read -rsn1 key || { echo "cancel"; return 0; }
    case "$key" in
      $'\x1b')
        rest=""
        IFS= read -rsn2 -t "$(escape_wait)" rest || rest=""
        case "$rest" in
          "[A"|"OA") cur=$(((cur - 1 + n) % n)) ;;
          "[B"|"OB") cur=$(((cur + 1) % n)) ;;
          *) printf '\n' >&2; echo "cancel"; return 0 ;;   # Esc alone, or Esc then anything
        esac
        ;;
      q|Q|$'\x04') printf '\n' >&2; echo "cancel"; return 0 ;;   # q or Ctrl-D
      k) cur=$(((cur - 1 + n) % n)) ;;
      j) cur=$(((cur + 1) % n)) ;;
      "") break ;;                             # Enter
    esac
    printf '\033[%dA' "$n" >&2
  done
  case "$cur" in 0) echo "setup" ;; 1) echo "uninstall" ;; 2) echo "sync" ;; esac
}

# Claude's install is managed as one filesystem transaction. Python keeps the
# JSON, symlink, mode, and byte-level snapshot logic in one place; bash remains
# responsible for the menu and token prompt. The temporary journal lets the
# next run finish rolling back if this process is killed between writes.
claude_lifecycle() {
  python3 - "$@" <<'PYEOF'
from __future__ import annotations

import base64
import binascii
import contextlib
import copy
import datetime
import fcntl
import hashlib
import json
import os
import pwd
import re
import shlex
import stat
import sys
import tempfile
import time


class LifecycleError(Exception):
    pass


class InstallConflict(LifecycleError):
    def __init__(self, names):
        super().__init__("existing Arena-owned settings changed after installation")
        self.names = names


@contextlib.contextmanager
def lifecycle_lock(journal_path):
    """Serialize setup/recovery/uninstall for one Arena home.

    The lock lives in the OS temp directory rather than ~/.arena so a fresh
    install can still uninstall back to an absent ~/.arena directory. flock is
    released by the kernel if the process crashes; the zero-byte lock file is
    intentionally reusable and contains no user data.
    """
    if os.environ.get("ARENA_SETUP_LOCK_HELD") == "1":
        yield
        return
    identity = os.path.realpath(os.path.dirname(journal_path)).encode()
    suffix = hashlib.sha256(identity).hexdigest()[:24]
    lock_path = os.path.join("/tmp", f"arena-setup-{os.getuid()}-{suffix}.lock")
    flags = os.O_CREAT | os.O_RDWR
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as exc:
        raise LifecycleError(f"could not open installer lock {lock_path}: {exc}") from exc
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
            raise LifecycleError(f"installer lock is not a private regular file: {lock_path}")
        os.fchmod(descriptor, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise LifecycleError(
                "another Arena setup or uninstall is already running for this home"
            ) from exc

        # Deterministic concurrency hook used only by the sandbox test suite.
        ready_path = os.environ.get("ARENA_SETUP_TEST_LOCK_READY_FILE")
        if ready_path:
            with open(ready_path, "w", encoding="utf-8") as handle:
                handle.write(f"{os.getpid()}\n")
                handle.flush()
                os.fsync(handle.fileno())
        hold_seconds = os.environ.get("ARENA_SETUP_TEST_HOLD_LOCK_SECONDS")
        if hold_seconds:
            time.sleep(float(hold_seconds))
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def file_mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def snapshot_path(path):
    if os.path.islink(path):
        return {"kind": "symlink", "target": os.readlink(path)}
    if not os.path.lexists(path):
        return {"kind": "absent"}
    if os.path.isfile(path):
        with open(path, "rb") as handle:
            content = handle.read()
        return {
            "kind": "file",
            "content_b64": base64.b64encode(content).decode("ascii"),
            "sha256": sha256(content),
            "mode": file_mode(path),
        }
    if os.path.isdir(path):
        return {"kind": "directory", "mode": file_mode(path)}
    raise LifecycleError(f"unsupported filesystem object at {path}")


def receipt_snapshot(path):
    snapshot = snapshot_path(path)
    if snapshot["kind"] == "directory":
        raise LifecycleError(f"expected a file at {path}, found a directory")
    return snapshot


def ensure_parent(path, mode=0o700):
    parent = os.path.dirname(path)
    if not parent or os.path.isdir(parent):
        return
    os.makedirs(parent, mode=mode, exist_ok=True)


def atomic_bytes(path, content, mode):
    ensure_parent(path)
    parent = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix=".arena-tmp-", dir=parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_json(path, value, mode=0o600):
    atomic_bytes(path, json_bytes(value), mode)


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def bytes_snapshot(content, mode):
    return {
        "kind": "file",
        "content_b64": base64.b64encode(content).decode("ascii"),
        "sha256": sha256(content),
        "mode": mode,
    }


def strip_jsonc(raw: str) -> str:
    """Mask comments and trailing commas without changing strings or offsets."""
    tokens = re.finditer(r'"(?:\\.|[^"\\])*"|//[^\r\n]*|/\*[\s\S]*?\*/|[^\s]', raw)
    chars = list(raw)
    significant = []
    for token in tokens:
        value = token.group()
        if value.startswith(("//", "/*")):
            for index in range(token.start(), token.end()):
                if chars[index] not in "\r\n":
                    chars[index] = " "
        else:
            significant.append(token)
    for index, token in enumerate(significant):
        if (
            token.group() == ","
            and index > 0
            and index + 1 < len(significant)
            and significant[index - 1].group() not in ("{", "[", ",", ":")
            and significant[index + 1].group() in ("}", "]")
        ):
            chars[token.start()] = " "
    if chars and chars[0] == "\ufeff":
        chars[0] = " "
    return "".join(chars)


def load_json_object(path, label, missing_ok=False, *, jsonc=False):
    if not os.path.exists(path):
        if missing_ok:
            return {}
        raise LifecycleError(f"{label} does not exist: {path}")
    try:
        with open(path, encoding="utf-8") as handle:
            raw = handle.read()
        if jsonc:
            raw = strip_jsonc(raw)
        value = json.loads(raw) if raw.strip() else {}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LifecycleError(f"{label} is not valid JSON ({path}): {exc}") from exc
    if not isinstance(value, dict):
        raise LifecycleError(f"{label} must contain a JSON object: {path}")
    env = value.get("env")
    if env is not None and not isinstance(env, dict):
        raise LifecycleError(f"{label} field 'env' must be a JSON object: {path}")
    return value


CAPABILITIES_PATH = ["env", "CLAUDE_CODE_MODEL_CAPABILITIES"]


def capability_selector(model: str) -> str:
    return re.sub(r"\[1m\]", "", model, flags=re.IGNORECASE)


def capability_effort(value: str, model: str) -> bool | None:
    # Claude Code 2.1.278 F5t: entries use ";", flags use ",", last match wins.
    model = capability_selector(model)
    effort = None
    for entry in value.split(";"):
        selector, separator, flags = entry.partition("=")
        if separator:
            selector = selector.strip()
            if not selector or not (
                model.startswith(selector[:-1]) if selector.endswith("*") else model == selector
            ):
                continue
        else:
            flags = entry
        for flag in flags.split(","):
            flag = flag.strip()
            if flag in ("effort", "-effort"):
                effort = flag == "effort"
    return effort


def capability_locks(owned: dict) -> list[str]:
    return owned.get("capability_locks", [owned["capability_lock"]])


def capability_restore(current: dict, owned: dict) -> dict | None:
    """Remove only our appended entries; preserve subsequent edits to other entries."""
    installed = owned["installed"]
    value = current.get("value")
    if not isinstance(value, str):
        return None
    if not capability_locks(owned) and value == installed["value"]:
        return copy.deepcopy(owned["before"])
    entries = value.split(";")
    for selector in capability_locks(owned):
        lock = selector + "=-effort"
        # Identical user-added entries are ambiguous. Keep them rather than guessing.
        if entries.count(lock) != installed["value"].split(";").count(lock):
            return None
        if lock not in entries:
            return None
        index = len(entries) - 1 - entries[::-1].index(lock)
        entries.pop(index)
    if not entries:
        return {"present": True, "value": ""} if owned["before"].get("present") else {"present": False}
    return {"present": True, "value": ";".join(entries)}


def migrate_capabilities(current: dict, owned: dict) -> None:
    """Recover old ownership in memory before the existing transaction writes it."""
    if "capability_lock" in owned:
        old_selector = owned["capability_lock"]
        selector = capability_selector(old_selector)
        if selector != old_selector:
            now = leaf_state(current, CAPABILITIES_PATH)
            if capability_restore(now, owned) is None:
                raise InstallConflict(["CLAUDE_CODE_MODEL_CAPABILITIES"])
            # Upgrade only the exact entry recorded by the previous writer.
            old_lock, lock = old_selector + "=-effort", selector + "=-effort"
            for state in (now, owned["installed"]):
                entries = state["value"].split(";")
                index = len(entries) - 1 - entries[::-1].index(old_lock)
                entries[index] = lock
                state["value"] = ";".join(entries)
            set_leaf(current, CAPABILITIES_PATH, now)
            owned["capability_lock"] = selector
            if "capability_locks" in owned:
                owned["capability_locks"] = [capability_selector(item) for item in owned["capability_locks"]]
        return
    now = leaf_state(current, CAPABILITIES_PATH)
    value = now.get("value", "")
    installed = owned["installed"]["value"]
    before = owned["before"]
    if len(owned["path"]) == 3:
        # Round 1 used commas as model delimiters. Undo that exact writer first.
        model = owned["path"][2]
        entries = value.split(",")
        matches = [entry for entry in entries if entry.partition("=")[0] == model]
        if ",".join(matches) != installed:
            raise LifecycleError("cannot safely migrate Claude capabilities; retained the legacy receipt")
        restored = []
        inserted = False
        for entry in entries:
            if entry.partition("=")[0] == model:
                if before.get("present") and not inserted:
                    restored.append(before["value"])
                    inserted = True
            else:
                restored.append(entry)
        recovered = {"present": True, "value": ",".join(restored)} if restored else before
    elif now == owned["installed"]:
        recovered = copy.deepcopy(before)
    elif isinstance(value, str) and value.startswith(installed + ";"):
        # The old installer replaced the entire string. Prepend its complete
        # baseline so later user entries still win, including duplicate selectors.
        suffix = value[len(installed) + 1:]
        original = before.get("value", "")
        recovered = {"present": True, "value": original + ";" + suffix if original else suffix}
    else:
        raise LifecycleError("cannot safely migrate Claude capabilities; retained the legacy receipt")
    set_leaf(current, CAPABILITIES_PATH, recovered)
    owned["path"] = CAPABILITIES_PATH.copy()
    owned["before"] = copy.deepcopy(recovered)
    owned["installed"] = copy.deepcopy(recovered)


def leaf_state(root, path):
    node = root
    for key in path[:-1]:
        if not isinstance(node, dict) or key not in node:
            return {"present": False}
        node = node[key]
    if isinstance(node, dict) and path[-1] in node:
        return {"present": True, "value": copy.deepcopy(node[path[-1]])}
    return {"present": False}


def set_leaf(root, path, state):
    node = root
    ancestors = []
    for key in path[:-1]:
        child = node.get(key)
        if not isinstance(child, dict):
            child = {}
            node[key] = child
        ancestors.append((node, key))
        node = child
    if state.get("present"):
        node[path[-1]] = copy.deepcopy(state.get("value"))
        return
    node.pop(path[-1], None)
    for parent, key in reversed(ancestors):
        child = parent.get(key)
        if isinstance(child, dict) and not child:
            parent.pop(key, None)
        else:
            break


def managed_updates(base_url, helper_path, model):
    env = {
        "ANTHROPIC_API_KEY": "",
        "ANTHROPIC_AUTH_TOKEN": "",
        "ANTHROPIC_BASE_URL": base_url,
        # The router alias is not in Claude Code's built-in model catalog.
        # Let Gateway enforce the selected model's context limit instead of
        # compacting proactively at Claude Code's unknown-model fallback.
        "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT": "1",
        # Cleared, not pinned: a tier-slot var equal to the ACTIVE model makes
        # Claude Code inject that tier's identity paragraph into the system
        # prompt (pinning the fable slot made every routed session claim to be
        # "Claude Fable 5" -- ENT-1698). Clearing still neutralizes values
        # inherited from GUI launchers; tier picks in /model now surface the
        # gateway's 403 instead of silently rerouting.
        "ANTHROPIC_DEFAULT_FABLE_MODEL": "",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "",
        "CLAUDE_CODE_USE_ANTHROPIC_AWS": "",
        "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD": "",
        "CLAUDE_CODE_USE_BEDROCK": "",
        "CLAUDE_CODE_USE_FOUNDRY": "",
        "CLAUDE_CODE_USE_GATEWAY": "",
        "CLAUDE_CODE_USE_MANTLE": "",
        "CLAUDE_CODE_USE_VERTEX": "",
    }
    env["CLAUDE_CODE_MODEL_CAPABILITIES"] = ";".join(
        selector + "=-effort" for selector in claude_effort_locks(model)
    )
    for key in (
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_MODEL",
        "ANTHROPIC_SMALL_FAST_MODEL",
        "CLAUDE_CODE_SUBAGENT_MODEL",
    ):
        env[key] = model
    updates = [
        {"path": ["env", key], "name": key, "value": value}
        for key, value in env.items()
    ]
    updates.append(
        {
            "path": ["apiKeyHelper"],
            "name": "apiKeyHelper",
            # Claude executes apiKeyHelper through a POSIX shell. Store a
            # command-safe path so valid homes containing spaces still work.
            "value": shlex.quote(helper_path),
        }
    )
    updates.append({"path": ["modelPicker"], "name": "modelPicker", "value": claude_model_picker(model)})
    return updates


def normalize_path(path):
    return os.path.abspath(os.path.expanduser(path))


def canonical_entry_path(path):
    """Resolve parent aliases while preserving the final directory entry."""
    normalized = normalize_path(path)
    return os.path.join(
        os.path.realpath(os.path.dirname(normalized)),
        os.path.basename(normalized),
    )


def adjacent_backup_path(logical_path):
    """Resolve parent symlinks without following the final backup entry."""
    candidate = normalize_path(logical_path) + ".arena-backup"
    return os.path.join(
        os.path.realpath(os.path.dirname(candidate)),
        os.path.basename(candidate),
    )


def receipt_owns_backup(claude):
    backup = claude.get("backup", {})
    if "owned" in backup:
        return backup.get("owned") is True
    # Early v1 receipts predate the explicit ownership bit and normally own
    # their adjacent backup. One transition build recorded realpath(final),
    # though, so a user backup symlink could appear as an external referent.
    # Preserve any old recorded path that cannot be proven adjacent.
    logical_path = claude.get("logical_path")
    recorded_path = backup.get("path")
    if not isinstance(logical_path, str) or not isinstance(recorded_path, str):
        return False
    return normalize_path(recorded_path) == adjacent_backup_path(logical_path)


def resolved_settings_path(logical_path):
    # realpath resolves symlinks in every parent component as well as the
    # final filename. Dotfile managers commonly symlink the whole ~/.claude
    # directory, and the receipt must retain the exact referent we mutate.
    resolved = os.path.realpath(logical_path)
    if os.path.islink(logical_path) and not os.path.exists(resolved):
        raise LifecycleError(f"Claude settings symlink is dangling: {logical_path}")
    return resolved


def remove_non_directory(path):
    if os.path.islink(path) or os.path.isfile(path):
        os.unlink(path)
    elif os.path.lexists(path):
        raise LifecycleError(f"refusing to replace directory or special file at {path}")


def restore_one(path, snapshot):
    kind = snapshot["kind"]
    if kind == "absent":
        # An absent directory may have been created by the transaction. It
        # is removed after all file snapshots have been restored, with
        # rmdir so concurrent/unrelated contents are never deleted.
        if os.path.isdir(path) and not os.path.islink(path):
            return
        remove_non_directory(path)
        return
    if kind == "directory":
        if os.path.lexists(path) and not os.path.isdir(path):
            remove_non_directory(path)
        if not os.path.isdir(path):
            os.makedirs(path, mode=snapshot["mode"], exist_ok=True)
        return
    ensure_parent(path)
    remove_non_directory(path)
    if kind == "symlink":
        os.symlink(snapshot["target"], path)
    elif kind == "file":
        atomic_bytes(path, base64.b64decode(snapshot["content_b64"]), snapshot["mode"])
    else:
        raise LifecycleError(f"unknown snapshot kind for {path}: {kind}")


def capture_paths(paths):
    seen = set()
    snapshots = []
    for path in paths:
        # macOS exposes /tmp and /var through /private. Treat those spellings
        # as one filesystem entry, while keeping a final symlink distinct from
        # its referent so settings topology can still be restored safely.
        path = canonical_entry_path(path)
        if path in seen:
            continue
        seen.add(path)
        snapshots.append({"path": path, "snapshot": snapshot_path(path)})
    return snapshots


def validate_snapshot(value, label):
    if not isinstance(value, dict):
        raise LifecycleError(f"{label} is not a filesystem snapshot")
    kind = value.get("kind")
    if kind == "absent":
        return
    if kind == "symlink":
        if not isinstance(value.get("target"), str):
            raise LifecycleError(f"{label} has an invalid symlink target")
        return
    if kind == "directory":
        mode = value.get("mode")
        if isinstance(mode, bool) or not isinstance(mode, int) or not 0 <= mode <= 0o7777:
            raise LifecycleError(f"{label} has an invalid directory mode")
        return
    if kind == "file":
        content_b64 = value.get("content_b64")
        digest = value.get("sha256")
        mode = value.get("mode")
        if (
            not isinstance(content_b64, str)
            or not isinstance(digest, str)
            or len(digest) != 64
            or isinstance(mode, bool)
            or not isinstance(mode, int)
            or not 0 <= mode <= 0o7777
        ):
            raise LifecycleError(f"{label} is an invalid file snapshot")
        try:
            content = base64.b64decode(content_b64, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise LifecycleError(f"{label} has invalid file contents") from exc
        if sha256(content) != digest:
            raise LifecycleError(f"{label} file digest does not match its contents")
        return
    raise LifecycleError(f"{label} has unknown snapshot kind {kind!r}")


def validated_journal_entries(raw_entries, snapshot_key, *, applied=False):
    if not isinstance(raw_entries, list):
        raise LifecycleError("Arena transaction journal has no path list")
    entries = []
    seen = set()
    for index, raw in enumerate(raw_entries):
        if not isinstance(raw, dict) or not isinstance(raw.get("path"), str):
            raise LifecycleError(f"Arena transaction journal path {index} is invalid")
        path = raw["path"]
        identity = canonical_entry_path(path)
        if path != normalize_path(path) or (applied and identity in seen):
            raise LifecycleError(f"Arena transaction journal path is unsafe or duplicated: {path}")
        seen.add(identity)
        before = raw.get(snapshot_key)
        validate_snapshot(before, f"Arena transaction journal Before for {path}")
        entry = {"path": path, "before": before}
        if applied:
            applied_snapshot = raw.get("applied")
            if applied_snapshot is not None:
                validate_snapshot(
                    applied_snapshot,
                    f"Arena transaction journal Applied for {path}",
                )
            entry["applied"] = applied_snapshot
        entries.append(entry)
    return entries


def cleanup_absent_directories(entries, journal_path):
    absent_dirs = [
        item["path"] for item in entries if item["before"]["kind"] == "absent"
    ]
    if os.path.isfile(journal_path):
        os.unlink(journal_path)
    for path in sorted(absent_dirs, key=lambda value: value.count(os.sep), reverse=True):
        if os.path.isdir(path) and not os.path.islink(path):
            try:
                os.rmdir(path)
            except OSError:
                pass


def load_receipt(state_path):
    receipt = load_json_object(state_path, "Arena install receipt")
    if receipt.get("version") != 1:
        raise LifecycleError(
            f"unsupported Arena install receipt version at {state_path}; leaving it untouched"
        )
    # A receipt carries one section per configured harness ("claude",
    # "opencode", "codex") plus the shared token/helper file entries. At least one
    # section must be present and well-formed; a malformed one fails closed.
    sections = [receipt.get(name) for name in HARNESS_SECTIONS if name in receipt]
    if not sections or not all(
        isinstance(section, dict) and isinstance(section.get("managed"), list)
        for section in sections
    ):
        raise LifecycleError(f"Arena install receipt is incomplete: {state_path}")
    return receipt


def recover_pending(journal_path, announce=True):
    if not os.path.exists(journal_path):
        return
    journal = load_json_object(journal_path, "Arena transaction journal")
    version = journal.get("version")
    if version == 1:
        # Version 1 recorded only Before. It cannot distinguish an installer
        # write from a user edit made after a crash. Delete this old journal
        # only when it proves no tracked path changed; otherwise retain every
        # byte and require explicit inspection instead of guessing.
        entries = validated_journal_entries(journal.get("snapshots"), "snapshot")
        changed = [
            item["path"]
            for item in entries
            if not snapshot_equivalent(snapshot_path(item["path"]), item["before"])
        ]
        if changed:
            rendered = "\n".join(f"  - {path}" for path in changed)
            raise LifecycleError(
                "cannot safely recover version-1 transaction journal because "
                "tracked paths changed; preserving them and retaining the journal:\n"
                + rendered
            )
        cleanup_absent_directories(entries, journal_path)
        if announce:
            sys.stderr.write("arena setup: cleared an untouched legacy transaction journal\n")
        return
    if version != 2:
        raise LifecycleError(
            f"cannot recover incomplete transaction journal at {journal_path}; leaving it untouched"
        )
    entries = validated_journal_entries(journal.get("paths"), "before", applied=True)

    # Classify every path before changing any of them. Before means the
    # transaction never reached that path (or already rolled it back); Applied
    # is the exact write-ahead image Arena intended. Anything else is a later
    # user/process edit and blocks recovery without being overwritten.
    classifications = []
    conflicts = []
    for item in entries:
        current = snapshot_path(item["path"])
        if snapshot_equivalent(current, item["before"]):
            classifications.append((item, "before"))
        elif item.get("applied") is not None and snapshot_equivalent(
            current, item["applied"]
        ):
            classifications.append((item, "applied"))
        else:
            conflicts.append(item["path"])
    if conflicts:
        rendered = "\n".join(f"  - {path}" for path in conflicts)
        raise LifecycleError(
            "cannot safely recover interrupted transaction because tracked paths "
            "changed after the crash; preserving them and retaining the journal:\n"
            + rendered
        )

    applied_entries = [item for item, status in classifications if status == "applied"]
    ordered = sorted(
        applied_entries,
        key=lambda item: item["before"]["kind"] == "directory",
    )
    for item in ordered:
        # Recheck immediately before each restore. Another writer does not use
        # our installer lock, so the all-path preflight alone cannot close this
        # window. A third state is retained for a later/manual resolution.
        current = snapshot_path(item["path"])
        if snapshot_equivalent(current, item["before"]):
            continue
        if not snapshot_equivalent(current, item["applied"]):
            raise LifecycleError(
                "tracked path changed during transaction recovery; preserving it "
                f"and retaining the journal: {item['path']}"
            )
        restore_one(item["path"], item["before"])
    cleanup_absent_directories(entries, journal_path)
    if announce:
        sys.stderr.write("arena setup: recovered an interrupted installer transaction\n")


def write_journal(journal_path, operation, snapshots):
    arena_dir = os.path.dirname(journal_path)
    if not os.path.isdir(arena_dir):
        os.makedirs(arena_dir, mode=0o700, exist_ok=True)
    entries = [
        {"path": item["path"], "before": item["snapshot"], "applied": None}
        for item in snapshots
    ]
    # Creating ~/.arena is necessary before its journal can exist. Record that
    # already-applied directory image in the initial journal so even a crash
    # immediately after publication has an exact Before/Applied classification.
    for item in entries:
        if item["path"] == canonical_entry_path(arena_dir) and item["before"]["kind"] == "absent":
            item["applied"] = snapshot_path(arena_dir)
    atomic_json(
        journal_path,
        {
            "version": 2,
            "operation": operation,
            "created_at": utc_now(),
            "paths": entries,
        },
        0o600,
    )


def record_applied(journal_path, path, applied):
    validate_snapshot(applied, f"Arena transaction Applied for {path}")
    journal = load_json_object(journal_path, "Arena transaction journal")
    if journal.get("version") != 2:
        raise LifecycleError("cannot update a non-version-2 transaction journal")
    entries = validated_journal_entries(journal.get("paths"), "before", applied=True)
    normalized = canonical_entry_path(path)
    matches = [item for item in entries if item["path"] == normalized]
    if len(matches) != 1:
        raise LifecycleError(f"transaction journal does not track path {normalized}")
    existing = matches[0].get("applied")
    if existing is not None and not snapshot_equivalent(existing, applied):
        raise LifecycleError(f"transaction journal already records another write for {normalized}")
    matches[0]["applied"] = copy.deepcopy(applied)
    atomic_json(
        journal_path,
        {
            **journal,
            "paths": [
                {
                    "path": item["path"],
                    "before": item["before"],
                    "applied": item.get("applied"),
                }
                for item in entries
            ],
        },
        0o600,
    )


def prepare_directory(journal_path, path, mode=0o700):
    path = normalize_path(path)
    if os.path.isdir(path):
        return
    if os.path.lexists(path):
        raise LifecycleError(f"expected a directory at {path}")
    applied = {"kind": "directory", "mode": mode}
    record_applied(journal_path, path, applied)
    os.makedirs(path, mode=mode, exist_ok=True)
    os.chmod(path, mode)


def rollback(journal_path):
    try:
        recover_pending(journal_path, announce=False)
    except BaseException as exc:
        sys.stderr.write(
            f"arena setup: automatic rollback failed: {exc}; recovery journal retained at {journal_path}\n"
        )
        return False
    return True


def maybe_fail(point):
    if os.environ.get("ARENA_SETUP_TEST_CRASH_AT") == point:
        os._exit(86)
    if os.environ.get("ARENA_SETUP_TEST_FAIL_AT") == point:
        raise LifecycleError(f"injected installer failure at {point}")


def settings_metadata(logical_path, resolved_path):
    exists = os.path.isfile(resolved_path)
    return {
        "existed": exists,
        "mode": file_mode(resolved_path) if exists else None,
        "logical_was_symlink": os.path.islink(logical_path),
        "symlink_target": os.readlink(logical_path) if os.path.islink(logical_path) else None,
    }


KNOWN_LEGACY_BASE_URLS = {
    "https://api.preview.arena.ai",
    "https://api-gateway.staging.spicyarena.ai",
    "https://api-gateway-k8s.staging.spicyarena.ai",
    "https://api-gateway-k8s.dev.spicyarena.ai",
    "http://localhost:9200",
    "http://gateway.arena.localtest.me",
}
KNOWN_LEGACY_MODELS = {"max-v0", "claude-max-v0", "coding-router-preview"}
COMMITTED_LEGACY_NAMES = {
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "apiKeyHelper",
}
INTERMEDIATE_ALIAS_NAMES = {
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
}
INTERMEDIATE_FINGERPRINT_ALIASES = INTERMEDIATE_ALIAS_NAMES - {"ANTHROPIC_MODEL"}
INTERMEDIATE_CONTROL_VALUES = {
    "CLAUDE_CODE_USE_BEDROCK": "",
    "CLAUDE_CODE_USE_VERTEX": "",
    "CLAUDE_CODE_USE_FOUNDRY": "",
    # Recognition-only: new installs no longer disable optional Claude
    # features, but exact legacy cohorts still need reversible cleanup.
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
}
INTERMEDIATE_LEGACY_NAMES = (
    COMMITTED_LEGACY_NAMES
    | INTERMEDIATE_ALIAS_NAMES
    | set(INTERMEDIATE_CONTROL_VALUES)
)
RETIRED_MANAGED_NAMES = {
    "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
}
RETIRED_LEGACY_UPDATES = (
    {
        "path": ["env", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"],
        "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
        "value": "1",
    },
)


def exact_legacy_helper_setting(value, helper_path):
    return isinstance(value, str) and value in {helper_path, shlex.quote(helper_path)}


def intermediate_model_fingerprint(environment):
    values = [environment.get(name) for name in INTERMEDIATE_FINGERPRINT_ALIASES]
    if (
        values
        and all(isinstance(value, str) for value in values)
        and len(set(values)) == 1
        and values[0] in KNOWN_LEGACY_MODELS
    ):
        return values[0]
    return None


def legacy_field_was_installed(update, current_state, cohort, helper_path):
    """Match a field only within the exact receipt-less generation that wrote it."""
    name = update["name"]
    present = current_state.get("present") is True
    value = current_state.get("value")
    if cohort == "committed":
        if name not in COMMITTED_LEGACY_NAMES:
            return False
        if name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
            # Every committed receipt-less installer removed these leaves.
            return not present
        if name == "ANTHROPIC_BASE_URL":
            return present and value in KNOWN_LEGACY_BASE_URLS
        if name == "ANTHROPIC_MODEL":
            return present and value in KNOWN_LEGACY_MODELS
        return present and exact_legacy_helper_setting(value, helper_path)
    if cohort == "intermediate":
        if name not in INTERMEDIATE_LEGACY_NAMES:
            return False
        if name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
            return present and value == ""
        if name == "ANTHROPIC_BASE_URL":
            return present and value in KNOWN_LEGACY_BASE_URLS
        if name in INTERMEDIATE_ALIAS_NAMES:
            return present and value in KNOWN_LEGACY_MODELS
        if name in INTERMEDIATE_CONTROL_VALUES:
            return present and value == INTERMEDIATE_CONTROL_VALUES[name]
        return present and exact_legacy_helper_setting(value, helper_path)
    return False


def exact_legacy_plumbing(token_path, helper_path):
    """Require the exact two-line helper shape used by older Arena installs."""
    if (
        not os.path.isfile(token_path)
        or os.path.islink(token_path)
        or not os.path.isfile(helper_path)
        or os.path.islink(helper_path)
    ):
        return False
    try:
        with open(helper_path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except (OSError, UnicodeDecodeError):
        return False
    if len(lines) != 2 or lines[0] != "#!/usr/bin/env bash":
        return False
    try:
        command = shlex.split(lines[1])
    except ValueError:
        return False
    if len(command) == 2 and command[0] == "cat":
        helper_token_path = command[1]
    elif len(command) == 3 and command[:2] == ["exec", "cat"]:
        helper_token_path = command[2]
    else:
        return False
    return normalize_path(helper_token_path) == normalize_path(token_path)


def detect_legacy_cohort(current, token_path, helper_path):
    """Identify one exact receipt-less installer generation, independent of this run."""
    env = current.get("env") if isinstance(current.get("env"), dict) else {}
    plumbing = exact_legacy_plumbing(token_path, helper_path)
    helper_anchor = exact_legacy_helper_setting(current.get("apiKeyHelper"), helper_path)
    if not plumbing:
        return None
    if (
        env.get("ANTHROPIC_API_KEY") == ""
        and env.get("ANTHROPIC_AUTH_TOKEN") == ""
        and intermediate_model_fingerprint(env) is not None
    ):
        return "intermediate"
    base_and_model_anchor = (
        env.get("ANTHROPIC_BASE_URL") in KNOWN_LEGACY_BASE_URLS
        and env.get("ANTHROPIC_MODEL") in KNOWN_LEGACY_MODELS
    )
    if helper_anchor or base_and_model_anchor:
        return "committed"
    return None


def classify_existing_backup(current, token_path, helper_path):
    """Return backup/external/ambiguous plus any proven legacy generation."""
    cohort = detect_legacy_cohort(current, token_path, helper_path)
    if cohort is not None:
        return "backup", cohort
    env = current.get("env") if isinstance(current.get("env"), dict) else {}
    historical_hint = (
        exact_legacy_helper_setting(current.get("apiKeyHelper"), helper_path)
        or env.get("ANTHROPIC_BASE_URL") in KNOWN_LEGACY_BASE_URLS
        or env.get("ANTHROPIC_MODEL") in KNOWN_LEGACY_MODELS
        or any(
            env.get(name) in KNOWN_LEGACY_MODELS
            for name in INTERMEDIATE_ALIAS_NAMES
        )
        or intermediate_model_fingerprint(env) is not None
    )
    return ("ambiguous", None) if historical_hint else ("external", None)


def make_new_receipt(
    logical_path,
    resolved_path,
    backup_path,
    state_path,
    arena_dir,
    token_path,
    helper_path,
    baseline,
    current,
    legacy_kind,
    legacy_cohort,
    backup_owned,
    updates,
):
    metadata = settings_metadata(logical_path, resolved_path)
    if legacy_kind == "backup":
        metadata["existed"] = True
        metadata["mode"] = file_mode(backup_path)
    elif legacy_kind == "fresh":
        # The prior installer only created an adjacent backup when the
        # settings file predated Arena. No backup means this recognizable
        # legacy install created settings.json from an absent baseline.
        metadata["existed"] = False
        metadata["mode"] = None
    managed = []
    for update in updates:
        name = update["name"]
        current_state = leaf_state(current, update["path"])
        legacy_installed = legacy_field_was_installed(
            update, current_state, legacy_cohort, helper_path
        )

        # A user may have changed even an old-owned field after the legacy
        # install. Only use the historical backup/absence while Current still
        # matches that installer's known value; otherwise the user's Current
        # value becomes the baseline for v1's new claim.
        before_source = (
            baseline
            if legacy_kind and legacy_installed
            else current
        )
        managed.append(
            {
                "path": update["path"],
                "name": update["name"],
                "before": leaf_state(before_source, update["path"]),
                "installed": {"present": True, "value": copy.deepcopy(update["value"])},
            }
        )
    directory_paths = {
        "arena": arena_dir,
        "claude_logical_parent": os.path.dirname(logical_path),
        "claude_resolved_parent": os.path.dirname(resolved_path),
    }
    directories = {}
    for name, path in directory_paths.items():
        snap = snapshot_path(path)
        directories[name] = {
            "path": path,
            "existed": snap["kind"] == "directory",
            "mode": snap.get("mode"),
        }
    return {
        "version": 1,
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "legacy_migration": legacy_kind is not None,
        "legacy_migration_kind": legacy_kind,
        "legacy_migration_cohort": legacy_cohort,
        "claude": {
            "logical_path": logical_path,
            "resolved_path": resolved_path,
            "settings_before": metadata,
            "installed_mode": None,
            "managed": managed,
            "backup": {
                "path": backup_path,
                "preexisting": os.path.lexists(backup_path),
                "owned": backup_owned,
                "installed": None,
            },
        },
        "files": {
            "token": {
                "path": token_path,
                # Receipt-less installers could reuse a token placed here by
                # the user. With no old receipt, preserve the exact artifact.
                "before": receipt_snapshot(token_path),
                "installed": None,
            },
            "helper": {
                "path": helper_path,
                # The old helper path likewise has no deletion provenance.
                "before": receipt_snapshot(helper_path),
                "installed": None,
            },
        },
        "directories": directories,
        "receipt_path": state_path,
    }


def validate_settings_topology(section: dict, label: str) -> None:
    recorded = normalize_path(section["logical_path"])
    recorded_resolved = normalize_path(section["resolved_path"])
    before_meta = section.get("settings_before", {})
    was_symlink = bool(before_meta.get("logical_was_symlink"))
    is_symlink = os.path.islink(recorded)
    topology_changed = os.path.realpath(recorded) != recorded_resolved
    final_link_changed = was_symlink != is_symlink or (
        was_symlink and is_symlink and os.readlink(recorded) != before_meta.get("symlink_target")
    )
    if topology_changed or final_link_changed:
        raise LifecycleError(
            f"{label} path or symlink target changed after installation; "
            "uninstall before installing into the new location"
        )


def shared_file_conflicts(receipt: dict, harness: str = "claude") -> list[str]:
    return [
        label
        for label, entry in receipt.get("files", {}).items()
        if (label != "codex_catalog" or harness == "codex")
        and entry.get("installed") is not None
        and not snapshot_equivalent(receipt_snapshot(entry["path"]), entry["installed"])
    ]


def validate_rerun(receipt, requested_path, current, updates, allow_conflicts):
    recorded = normalize_path(receipt["claude"]["logical_path"])
    if normalize_path(requested_path) != recorded:
        raise LifecycleError(
            "Claude was previously configured at "
            f"{recorded}, but CLAUDE_CONFIG_DIR now points elsewhere; uninstall first"
        )
    validate_settings_topology(receipt["claude"], "Claude settings")
    installed_by_name = {item["name"]: item for item in receipt["claude"]["managed"]}
    conflicts = []
    checked_names = {update["name"] for update in updates} | {"CLAUDE_CODE_MODEL_CAPABILITIES"}
    for prior in installed_by_name.values():
        if prior["name"] not in checked_names:
            continue
        if prior["name"] == "CLAUDE_CODE_MODEL_CAPABILITIES" and "capability_lock" in prior:
            now = leaf_state(current, CAPABILITIES_PATH)
            if (capability_restore(now, prior) is None
                    or any(capability_effort(now.get("value", ""), selector) is not False
                           for selector in capability_locks(prior))):
                conflicts.append(prior["name"])
        elif leaf_state(current, prior["path"]) != prior.get("installed"):
            conflicts.append(prior["name"])
    installed_mode = receipt["claude"].get("installed_mode")
    resolved = normalize_path(receipt["claude"]["resolved_path"])
    if os.path.isfile(resolved) and installed_mode is not None and file_mode(resolved) != installed_mode:
        conflicts.append("Claude settings mode")
    conflicts.extend(shared_file_conflicts(receipt))
    backup = receipt["claude"].get("backup", {})
    if receipt_owns_backup(receipt["claude"]) and backup.get("path") and not snapshot_equivalent(
        receipt_snapshot(backup["path"]), backup.get("installed")
    ):
        conflicts.append("Claude settings backup")
    if conflicts and not allow_conflicts:
        raise InstallConflict(list(dict.fromkeys(conflicts)))


def install(args, *, check_only=False):
    (
        requested_path,
        state_path,
        journal_path,
        arena_dir,
        token_path,
        helper_path,
        base_url,
        model,
        staged_token,
        allow_conflicts_raw,
    ) = args
    requested_path = normalize_path(requested_path)
    state_path = normalize_path(state_path)
    journal_path = normalize_path(journal_path)
    arena_dir = normalize_path(arena_dir)
    token_path = normalize_path(token_path)
    helper_path = normalize_path(helper_path)
    allow_conflicts = allow_conflicts_raw == "1"

    recover_pending(journal_path)
    updates = managed_updates(base_url, helper_path, model)
    retired_fields = []
    existing_receipt = os.path.exists(state_path)
    shared_receipt = None
    if existing_receipt:
        receipt = load_receipt(state_path)
        if not isinstance(receipt.get("claude"), dict):
            # Another harness created the receipt; Claude joins it as a fresh
            # section and reuses the baselines for files already owned by Arena.
            shared_receipt = receipt
            existing_receipt = False
            conflicts = shared_file_conflicts(shared_receipt)
            if conflicts and not allow_conflicts:
                raise InstallConflict(conflicts)
    if existing_receipt:
        logical_path = normalize_path(receipt["claude"]["logical_path"])
        resolved_path = normalize_path(receipt["claude"]["resolved_path"])
        backup_path = normalize_path(receipt["claude"]["backup"]["path"])
        current = load_json_object(resolved_path, "Claude settings", missing_ok=True)
        for owned in receipt["claude"]["managed"]:
            if owned["name"] == "CLAUDE_CODE_MODEL_CAPABILITIES":
                migrate_capabilities(current, owned)
        validate_rerun(receipt, requested_path, current, updates, allow_conflicts)
        retired_fields = [
            copy.deepcopy(owned)
            for owned in receipt["claude"]["managed"]
            if owned.get("name") in RETIRED_MANAGED_NAMES
        ]
    else:
        logical_path = requested_path
        resolved_path = resolved_settings_path(logical_path)
        # Resolve parent-directory symlinks but never the final backup entry.
        # A user-controlled final symlink must not turn cleanup into deletion
        # of an unrelated referent or turn backup creation into an external
        # write.
        backup_path = adjacent_backup_path(logical_path)
        current = load_json_object(resolved_path, "Claude settings", missing_ok=True)
        backup_exists = os.path.lexists(backup_path)
        legacy_kind = None
        legacy_cohort = None
        backup_owned = not backup_exists
        if backup_exists:
            backup_class, legacy_cohort = classify_existing_backup(
                current, token_path, helper_path
            )
            backup_is_regular = os.path.isfile(backup_path) and not os.path.islink(backup_path)
            if backup_class == "backup" and not backup_is_regular:
                backup_class = "ambiguous"
            if backup_class == "backup":
                legacy_kind = "backup"
                # A receipt-less installer skipped an already-present backup,
                # so its existence cannot prove who created it. It is usable
                # as a field baseline but never deletion-owned.
                backup_owned = False
            elif backup_class == "ambiguous":
                raise LifecycleError(
                    f"found {backup_path}, but current Claude settings do not look like a legacy Arena install; "
                    "move the ambiguous backup aside or uninstall the older setup first"
                )
        else:
            legacy_cohort = detect_legacy_cohort(current, token_path, helper_path)
            if legacy_cohort is not None:
                legacy_kind = "fresh"
        baseline = (
            load_json_object(backup_path, "legacy Claude settings backup")
            if legacy_kind == "backup"
            else ({} if legacy_kind == "fresh" else copy.deepcopy(current))
        )
        if legacy_kind:
            for update in RETIRED_LEGACY_UPDATES:
                installed = leaf_state(current, update["path"])
                if legacy_field_was_installed(
                    update, installed, legacy_cohort, helper_path
                ):
                    retired_fields.append(
                        {
                            "path": update["path"],
                            "name": update["name"],
                            "before": leaf_state(baseline, update["path"]),
                            "installed": installed,
                        }
                    )
        receipt = make_new_receipt(
            logical_path,
            resolved_path,
            backup_path,
            state_path,
            arena_dir,
            token_path,
            helper_path,
            baseline,
            current,
            legacy_kind,
            legacy_cohort,
            backup_owned,
            updates,
        )
        if shared_receipt is not None:
            adopt_shared_receipt(receipt, shared_receipt)

    selectors = claude_effort_locks(model)
    capability_owned = next(
        (owned for owned in receipt["claude"]["managed"]
         if owned["name"] == "CLAUDE_CODE_MODEL_CAPABILITIES"), None
    )
    for update in updates:
        if update["name"] != "CLAUDE_CODE_MODEL_CAPABILITIES":
            continue
        update["value"] = claude_capabilities(current, capability_owned, selectors)

    if staged_token != "-":
        try:
            with open(staged_token, "rb") as handle:
                staged_token_bytes = handle.read()
        except OSError as exc:
            raise LifecycleError(f"could not read the staged Arena token: {exc}") from exc
        if not staged_token_bytes:
            raise LifecycleError("Arena token cannot be empty")
    else:
        staged_token_bytes = None
        if not os.path.isfile(token_path):
            raise LifecycleError(f"no Arena token found at {token_path}")

    helper_content = helper_script_bytes(token_path)
    path_list = [
        arena_dir,
        os.path.dirname(logical_path),
        os.path.dirname(resolved_path),
        token_path,
        helper_path,
        logical_path,
        resolved_path,
        state_path,
    ]
    if receipt_owns_backup(receipt["claude"]):
        path_list.append(backup_path)
    snapshots = capture_paths(path_list)
    if check_only:
        return
    try:
        write_journal(journal_path, "install", snapshots)
        maybe_fail("after-journal")

        prepare_directory(journal_path, os.path.dirname(logical_path))
        prepare_directory(journal_path, os.path.dirname(resolved_path))

        if staged_token_bytes is not None:
            token_bytes = staged_token_bytes
            record_applied(journal_path, token_path, bytes_snapshot(token_bytes, 0o600))
            atomic_bytes(token_path, staged_token_bytes, 0o600)
        elif os.path.islink(token_path):
            # Do not chmod through a user symlink. Copy its current bytes into
            # a private Arena-owned regular file for the installed lifetime;
            # the receipt restores the original link on uninstall.
            with open(token_path, "rb") as handle:
                token_bytes = handle.read()
            record_applied(journal_path, token_path, bytes_snapshot(token_bytes, 0o600))
            atomic_bytes(token_path, token_bytes, 0o600)
        else:
            with open(token_path, "rb") as handle:
                token_bytes = handle.read()
            record_applied(journal_path, token_path, bytes_snapshot(token_bytes, 0o600))
            os.chmod(token_path, 0o600)
        maybe_fail("after-token")

        record_applied(journal_path, helper_path, bytes_snapshot(helper_content, 0o700))
        atomic_bytes(helper_path, helper_content, 0o700)
        maybe_fail("after-helper")

        if not existing_receipt and not os.path.lexists(backup_path) and os.path.isfile(resolved_path):
            with open(resolved_path, "rb") as handle:
                original_bytes = handle.read()
            # Settings may contain credentials. The recovery copy is private
            # even when the source settings file had a broader mode.
            record_applied(
                journal_path, backup_path, bytes_snapshot(original_bytes, 0o600)
            )
            atomic_bytes(backup_path, original_bytes, 0o600)
        maybe_fail("after-backup")

        merged = copy.deepcopy(current)
        retired_targets = []
        for retired in retired_fields:
            if leaf_state(merged, retired["path"]) == retired.get("installed"):
                set_leaf(merged, retired["path"], retired["before"])
                retired_targets.append(retired)
        for update in updates:
            set_leaf(merged, update["path"], {"present": True, "value": update["value"]})
        target_mode = file_mode(resolved_path) if os.path.isfile(resolved_path) else 0o600
        merged_bytes = json_bytes(merged)
        record_applied(
            journal_path, resolved_path, bytes_snapshot(merged_bytes, target_mode)
        )
        atomic_json(resolved_path, merged, target_mode)
        written = load_json_object(resolved_path, "installed Claude settings")
        for update in updates:
            if leaf_state(written, update["path"]) != {
                "present": True,
                "value": update["value"],
            }:
                raise LifecycleError(
                    f"post-write verification failed for Claude setting {update['name']}"
                )
        for retired in retired_targets:
            if leaf_state(written, retired["path"]) != retired["before"]:
                raise LifecycleError(
                    f"post-write verification failed while retiring Claude setting {retired['name']}"
                )
        maybe_fail("after-settings")

        receipt["claude"]["managed"] = [
            owned
            for owned in receipt["claude"]["managed"]
            if owned.get("name") not in RETIRED_MANAGED_NAMES
        ]
        installed_by_name = {item["name"]: item for item in receipt["claude"]["managed"]}
        for update in updates:
            installed = {"present": True, "value": copy.deepcopy(update["value"])}
            if update["name"] in installed_by_name:
                installed_by_name[update["name"]]["installed"] = installed
                installed_by_name[update["name"]]["path"] = update["path"]
            else:
                receipt["claude"]["managed"].append(
                    {
                        "path": update["path"],
                        "name": update["name"],
                        # A newer installer may begin managing another field.
                        # Capture its current value as the new field's baseline
                        # instead of pretending it was absent.
                        "before": leaf_state(current, update["path"]),
                        "installed": installed,
                    }
                )
        for owned in receipt["claude"]["managed"]:
            if owned["name"] == "CLAUDE_CODE_MODEL_CAPABILITIES":
                owned["capability_lock"] = (selectors[0] if selectors else "")
                owned["capability_locks"] = selectors
        receipt["claude"]["installed_mode"] = file_mode(resolved_path)
        receipt["claude"]["models"] = model_receipt(model)
        if not existing_receipt:
            if receipt_owns_backup(receipt["claude"]):
                receipt["claude"]["backup"]["installed"] = receipt_snapshot(backup_path)
        receipt["files"]["token"]["installed"] = receipt_snapshot(token_path)
        receipt["files"]["helper"]["installed"] = receipt_snapshot(helper_path)
        receipt["updated_at"] = utc_now()
        receipt_bytes = json_bytes(receipt)
        record_applied(
            journal_path, state_path, bytes_snapshot(receipt_bytes, 0o600)
        )
        atomic_json(state_path, receipt, 0o600)
        maybe_fail("after-state")

        os.unlink(journal_path)
        print(logical_path)
    except BaseException:
        rollback(journal_path)
        raise


def snapshot_equivalent(current, expected):
    if not isinstance(expected, dict) or current.get("kind") != expected.get("kind"):
        return False
    if current.get("kind") == "absent":
        return True
    if current.get("kind") == "symlink":
        return current.get("target") == expected.get("target")
    if current.get("kind") == "directory":
        return current.get("mode") == expected.get("mode")
    if current.get("kind") == "file":
        return (
            current.get("sha256") == expected.get("sha256")
            and current.get("mode") == expected.get("mode")
        )
    return False


def restore_owned_file(entry, label, conflicts, journal_path):
    path = normalize_path(entry["path"])
    current = receipt_snapshot(path)
    installed = entry.get("installed")
    before = entry.get("before")
    if not snapshot_equivalent(current, installed):
        conflicts.append(label)
        return
    record_applied(journal_path, path, before)
    restore_one(path, before)


def cleanup_backup(claude, conflicts, journal_path):
    if not receipt_owns_backup(claude):
        return
    backup = claude["backup"]
    path = normalize_path(backup["path"])
    current = receipt_snapshot(path)
    installed = backup.get("installed")
    if not snapshot_equivalent(current, installed):
        if current.get("kind") != "absent":
            conflicts.append("Claude settings backup")
        return
    record_applied(journal_path, path, {"kind": "absent"})
    remove_non_directory(path)


def uninstall(args):
    state_path, journal_path = map(normalize_path, args)
    recover_pending(journal_path)
    if not os.path.exists(state_path):
        return 4
    receipt = load_receipt(state_path)
    if not isinstance(receipt.get("claude"), dict):
        return 4
    claude = receipt["claude"]
    # While another harness section remains, the shared token and helper stay
    # in place and the receipt is rewritten without the Claude section.
    keep_shared = other_sections_remain(receipt, "claude")
    logical_path = normalize_path(claude["logical_path"])
    resolved_path = normalize_path(claude["resolved_path"])
    backup_path = normalize_path(claude["backup"]["path"])

    # Parse before creating the journal or changing any other artifact. A
    # malformed user file therefore leaves the whole installed state intact.
    # If a formerly-regular logical path became a symlink, the user replaced
    # the entire settings file; leave that new referent untouched as a
    # three-way conflict.
    before_meta = claude["settings_before"]
    topology_changed = os.path.realpath(logical_path) != resolved_path
    # If the recorded path is also the logical path, a newly introduced
    # symlink now occupies the only directory entry we could write (the
    # recorded path may use an OS-level alias such as /private/var vs /var,
    # so string equality alone cannot detect this). For parent/final symlinks
    # that originally resolved elsewhere, we can still restore the recorded
    # old referent without touching the user's new topology.
    final_link_replaced_regular = (
        not before_meta.get("logical_was_symlink") and os.path.islink(logical_path)
    )
    recorded_referent_replaced = (
        os.path.islink(resolved_path) or os.path.realpath(resolved_path) != resolved_path
    )
    settings_path_conflict = (
        final_link_replaced_regular
        or recorded_referent_replaced
        or not os.path.isfile(resolved_path)
    )
    current_exists = os.path.isfile(resolved_path) and not settings_path_conflict
    current = (
        {}
        if settings_path_conflict
        else load_json_object(resolved_path, "Claude settings", missing_ok=True)
    )

    path_list = [state_path, logical_path, resolved_path]
    if receipt_owns_backup(claude):
        path_list.append(backup_path)
    if not keep_shared:
        for entry in receipt.get("files", {}).values():
            path_list.append(entry["path"])
    for entry in section_directories(receipt, "claude", keep_shared).values():
        path_list.append(entry["path"])
    snapshots = capture_paths(path_list)
    conflicts = []
    try:
        write_journal(journal_path, "uninstall", snapshots)
        maybe_fail("uninstall-after-journal")

        if settings_path_conflict:
            conflicts.append("Claude settings path")
        else:
            if topology_changed:
                conflicts.append("Claude settings path")
            restored = copy.deepcopy(current)
            for owned in claude["managed"]:
                if owned["name"] == "CLAUDE_CODE_MODEL_CAPABILITIES":
                    if "capability_lock" not in owned:
                        migrate_capabilities(restored, owned)
                        continue
                    recovered = capability_restore(leaf_state(restored, CAPABILITIES_PATH), owned)
                    if recovered is None:
                        conflicts.append(owned["name"])
                    else:
                        set_leaf(restored, CAPABILITIES_PATH, recovered)
                    continue
                now = leaf_state(restored, owned["path"])
                if now == owned.get("installed"):
                    set_leaf(restored, owned["path"], owned["before"])
                else:
                    conflicts.append(owned["name"])

            if not before_meta.get("existed") and not restored:
                record_applied(journal_path, resolved_path, {"kind": "absent"})
                remove_non_directory(resolved_path)
            elif current_exists or before_meta.get("existed") or restored:
                current_mode = file_mode(resolved_path) if os.path.isfile(resolved_path) else None
                installed_mode = claude.get("installed_mode")
                if before_meta.get("existed") and current_mode == installed_mode:
                    desired_mode = before_meta.get("mode") or 0o600
                elif current_mode is not None:
                    desired_mode = current_mode
                    if installed_mode is not None and current_mode != installed_mode:
                        conflicts.append("Claude settings mode")
                else:
                    desired_mode = before_meta.get("mode") or 0o600
                restored_bytes = json_bytes(restored)
                record_applied(
                    journal_path,
                    resolved_path,
                    bytes_snapshot(restored_bytes, desired_mode),
                )
                atomic_json(resolved_path, restored, desired_mode)
        maybe_fail("uninstall-after-settings")

        if not keep_shared:
            restore_shared_files(receipt, conflicts, journal_path)
        cleanup_backup(claude, conflicts, journal_path)
        maybe_fail("uninstall-after-files")

        release_section(receipt, "claude", state_path, journal_path)
        maybe_fail("uninstall-after-state")
        os.unlink(journal_path)

        # Remove only directories that this install created, and only while
        # they are empty. Unrelated files make rmdir fail harmlessly.
        directory_entries = sorted(
            section_directories(receipt, "claude", keep_shared).values(),
            key=lambda item: normalize_path(item["path"]).count(os.sep),
            reverse=True,
        )
        for entry in directory_entries:
            path = normalize_path(entry["path"])
            if not entry.get("existed") and os.path.isdir(path) and not os.path.islink(path):
                try:
                    os.rmdir(path)
                except OSError:
                    pass

        for name in dict.fromkeys(conflicts):
            print(f"PRESERVED {name}")
        return 0
    except BaseException:
        rollback(journal_path)
        raise


HARNESS_SECTIONS = ("claude", "opencode", "codex")


def other_sections_remain(receipt, name):
    return any(
        isinstance(receipt.get(other), dict)
        for other in HARNESS_SECTIONS
        if other != name
    )


def section_directories(receipt, name, keep_shared):
    """Directories to consider for cleanup when releasing one harness section.

    While another section remains, only the directories recorded for this
    harness are candidates; the shared ~/.arena directory stays.
    """
    directories = receipt.get("directories", {})
    if not keep_shared:
        return directories
    return {
        key: value
        for key, value in directories.items()
        if key.startswith(name + "_")
    }


def restore_shared_files(receipt, conflicts, journal_path):
    for label, entry in receipt.get("files", {}).items():
        # An entry with no installed snapshot was recorded as a baseline by a
        # harness that never wrote it (OpenCode does not need the helper).
        if entry.get("installed") is None:
            continue
        if label == "token" and any(
            opencode_config_references_token(path, entry["path"])
            for path in entry.get("opencode_configs", [])
        ):
            conflicts.append("token referenced by OpenCode")
            continue
        if label == "token" and any(
            codex_config_references_helper(path, receipt["files"]["helper"]["path"])
            for path in entry.get("codex_configs", [])
        ):
            conflicts.append("token referenced by Codex")
            continue
        if label == "helper" and any(
            codex_config_references_helper(path, entry["path"])
            for path in entry.get("codex_configs", [])
        ):
            conflicts.append("helper referenced by Codex")
            continue
        restore_owned_file(entry, label, conflicts, journal_path)


def opencode_config_references_token(config_path: str, token_path: str) -> bool:
    if not os.path.exists(config_path):
        return False
    try:
        with open(config_path, encoding="utf-8") as handle:
            content = handle.read()
    except (OSError, UnicodeDecodeError):
        # An unreadable retained config cannot prove the token is unused.
        return True
    for reference in re.findall(r"\{file:([^}]+)\}", content):
        referenced_path = os.path.join(os.path.dirname(config_path), os.path.expanduser(reference))
        if os.path.realpath(referenced_path) == os.path.realpath(token_path):
            return True
    return False


def release_section(receipt, name, state_path, journal_path):
    """Drop one harness section from the receipt, deleting it when empty."""
    if not other_sections_remain(receipt, name):
        record_applied(journal_path, state_path, {"kind": "absent"})
        os.unlink(state_path)
        return
    remaining = {key: value for key, value in receipt.items() if key != name}
    remaining["directories"] = {
        key: value
        for key, value in receipt.get("directories", {}).items()
        if not key.startswith(name + "_")
    }
    remaining["updated_at"] = utc_now()
    record_applied(journal_path, state_path, bytes_snapshot(json_bytes(remaining), 0o600))
    atomic_json(state_path, remaining, 0o600)


def adopt_shared_receipt(receipt, shared_receipt):
    """Merge a fresh harness receipt into one another harness already wrote.

    Keep the original baseline for files already written by Arena. A file
    that the earlier harness never touched gets its current baseline when
    the joining harness first takes ownership.
    """
    for label, entry in shared_receipt["files"].items():
        if entry.get("installed") is not None:
            receipt["files"][label] = copy.deepcopy(entry)
    # Shared directory baselines (the ~/.arena entry) also predate this
    # install: the fresh receipt saw the directory the other harness created
    # and would record it as pre-existing, leaving it behind on uninstall.
    receipt["directories"].update(copy.deepcopy(shared_receipt.get("directories", {})))
    for name in HARNESS_SECTIONS:
        if name in shared_receipt and name not in receipt:
            receipt[name] = copy.deepcopy(shared_receipt[name])
    receipt["created_at"] = shared_receipt.get("created_at", receipt["created_at"])


def helper_script_bytes(token_path):
    """The key helper Claude Code (apiKeyHelper) and Codex (auth.command) run.

    Both tools execute it directly with no shell environment of their own, so
    it resolves bash through /usr/bin/env and prints the private token file.
    """
    return ("#!/usr/bin/env bash\nexec cat " + shlex.quote(token_path) + "\n").encode()


def codex_catalog_path(arena_dir):
    return os.path.join(arena_dir, CODEX_CATALOG_FILE)


def codex_catalog_entry(arena_dir):
    path = codex_catalog_path(arena_dir)
    return {"path": path, "before": receipt_snapshot(path), "installed": None}


def make_shared_receipt(state_path, arena_dir, token_path, helper_path):
    snap = snapshot_path(arena_dir)
    return {
        "version": 1,
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "legacy_migration": False,
        "legacy_migration_kind": None,
        "legacy_migration_cohort": None,
        "files": {
            "token": {"path": token_path, "before": receipt_snapshot(token_path), "installed": None},
            "helper": {"path": helper_path, "before": receipt_snapshot(helper_path), "installed": None},
            "codex_catalog": codex_catalog_entry(arena_dir),
        },
        "directories": {
            "arena": {
                "path": arena_dir,
                "existed": snap["kind"] == "directory",
                "mode": snap.get("mode"),
            }
        },
        "receipt_path": state_path,
    }


def read_staged_token(staged_token, token_path):
    if staged_token == "-":
        if not os.path.isfile(token_path):
            raise LifecycleError(f"no Arena token found at {token_path}")
        return None
    try:
        with open(staged_token, "rb") as handle:
            staged_bytes = handle.read()
    except OSError as exc:
        raise LifecycleError(f"could not read the staged Arena token: {exc}") from exc
    if not staged_bytes:
        raise LifecycleError("Arena token cannot be empty")
    return staged_bytes


def place_token(journal_path, token_path, staged_bytes):
    """Write or adopt the private token file inside the current transaction."""
    if staged_bytes is not None:
        record_applied(journal_path, token_path, bytes_snapshot(staged_bytes, 0o600))
        atomic_bytes(token_path, staged_bytes, 0o600)
        return
    with open(token_path, "rb") as handle:
        token_bytes = handle.read()
    record_applied(journal_path, token_path, bytes_snapshot(token_bytes, 0o600))
    if os.path.islink(token_path):
        # Never chmod through a user symlink; keep a private regular copy for
        # the installed lifetime and restore the link on uninstall.
        atomic_bytes(token_path, token_bytes, 0o600)
    else:
        os.chmod(token_path, 0o600)


OPENCODE_PROVIDER_ID = "arena"
OPENCODE_PROVIDER_NAME = "Arena"
# The router alias fans out to models whose smallest window is 1M context
# and 128K output. Direct models use their own authenticated metadata.
# OpenCode custom providers get no model discovery, so declare the floor.
OPENCODE_CONTEXT_LIMIT = 1000000
OPENCODE_OUTPUT_LIMIT = 128000


ROUTER_MODEL_IDS = {"coding-router-preview", "claude-coding-router-preview", "claude-max-v0", "max-v0"}


def enabled_models(model: str, *, announce=False) -> list[dict]:
    """Use only exact IDs returned by authenticated discovery."""
    path = os.environ.get("ARENA_SETUP_MODELS_FILE")
    catalog = load_json_object(path, "portal model list") if path else {}
    gateway_url = catalog.get("gatewayUrl")
    selected_url = os.environ.get("ARENA_SETUP_GATEWAY_URL")
    gateway_aliases = (
        ("https://api.arena.ai", "https://api.preview.arena.ai"),
        ("https://api-gateway.staging.spicyarena.ai", "https://api-gateway-k8s.staging.spicyarena.ai"),
    )
    if gateway_url != selected_url and not any(
        gateway_url in aliases and selected_url in aliases for aliases in gateway_aliases
    ):
        raise LifecycleError("portal and gateway environments differ; use the matching portal's setup script")
    data = catalog.get("data")
    if not isinstance(data, list):
        raise LifecycleError("invalid model discovery response; nothing changed")
    rows = {}
    preferred_router = next((row.get("id") for row in data if isinstance(row, dict) and row.get("id") == "coding-router-preview"), None)
    if preferred_router is None:
        preferred_router = next((row.get("id") for row in data if isinstance(row, dict) and row.get("id") in ROUTER_MODEL_IDS), None)
    skipped = False
    for row in data:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            raise LifecycleError("invalid model discovery entry")
        model_id = row["id"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/\-]*", model_id) or model_id in rows:
            raise LifecycleError("invalid model discovery ID")
        if model_id in ROUTER_MODEL_IDS:
            if model_id != preferred_router:
                continue
            rows[model_id] = {
                "id": model_id, "name": "Arena Coding Router",
                "context": OPENCODE_CONTEXT_LIMIT, "output": OPENCODE_OUTPUT_LIMIT,
                "input_modalities": ["text", "image"], "attachment": True,
                "tool_call": True, "reasoning": True,
            }
        elif row.get("arena_type") == "routing" or model_id == "exo":
            continue
        elif all(key in row for key in ("name", "context", "output", "input_modalities", "attachment", "tool_call", "reasoning")):
            name, context, output = row["name"], row["context"], row["output"]
            modalities = row["input_modalities"]
            efforts = row.get("reasoning_efforts", [])
            default_effort = row.get("default_reasoning_effort")
            if (not isinstance(name, str) or not name
                    or any(ord(char) < 32 or ord(char) == 127 for char in name)
                    or type(context) is not int or type(output) is not int or not 0 < output < context
                    or not isinstance(modalities, list) or not modalities
                    or any(value not in ("text", "image") for value in modalities)
                    or any(type(row[key]) is not bool for key in ("attachment", "tool_call", "reasoning"))
                    or not isinstance(efforts, list)
                    or any(value not in ("none", "minimal", "low", "medium", "high", "xhigh", "max") for value in efforts)
                    or (default_effort is not None and default_effort not in efforts)):
                raise LifecycleError("invalid model discovery metadata")
            rows[model_id] = {**row, "name": "Arena " + name}
        else:
            skipped = True
    if announce and skipped:
        print("Some models were skipped.", file=sys.stderr)
    if not rows:
        raise LifecycleError("this key has no supported models; ask your administrator to enable model access")
    ordered = list(rows.values())
    ordered.sort(key=lambda row: row["id"] != "coding-router-preview")
    return ordered


def claude_model_picker(model: str) -> dict:
    return {
        "replaceBuiltInOptions": True,
        "options": [
            {"model": row["id"], "label": row["name"], "description": row["name"]}
            for row in enabled_models(model)
        ],
    }


def claude_effort_locks(model: str) -> list[str]:
    return [row["id"] for row in enabled_models(model) if not row.get("reasoning_efforts")]


def claude_capabilities(current: dict, owned: dict | None, selectors: list[str]) -> str:
    now = leaf_state(current, CAPABILITIES_PATH)
    if owned and "capability_lock" in owned:
        recovered = capability_restore(now, owned)
        if (capability_locks(owned) == selectors and recovered is not None
                and all(capability_effort(now.get("value", ""), selector) is False for selector in selectors)):
            return now["value"]
        if recovered is not None:
            now = recovered
        # Explicitly confirmed conflicts start a fresh ownership claim.
        owned["before"] = copy.deepcopy(now)
    value = ";".join(selector + "=-effort" for selector in selectors)
    return now.get("value", "") + (";" + value if value else "") if now.get("present") else value


def model_receipt(model: str) -> dict:
    return {"ids": [row["id"] for row in enabled_models(model)]}


def opencode_models(model: str) -> dict:
    return {
        row["id"]: {
            "name": row["name"],
            "modalities": {"input": row["input_modalities"], "output": ["text"]},
            "attachment": row["attachment"], "tool_call": row["tool_call"],
            **({"reasoning": True} if row.get("reasoning_efforts") else {}),
            # OpenCode deep-merges config sources. Omission does not clear an
            # inherited reasoning flag or named variants; an empty dict does
            # not clear variants either. Keep the router's effort automatic.
            **({"reasoning": False, "variants": {
                effort: {"disabled": True} for effort in ("low", "medium", "high")
            }} if row["id"] in ROUTER_MODEL_IDS else {}),
            "limit": {"context": row["context"], "output": row["output"],
                      **({} if row["id"] in ROUTER_MODEL_IDS else {"input": row["context"] - row["output"]})},
        }
        for row in enabled_models(model)
    }


def opencode_updates(base_url, token_path, model):
    qualified = OPENCODE_PROVIDER_ID + "/" + model
    provider = {
        "npm": "@ai-sdk/openai-compatible",
        "name": OPENCODE_PROVIDER_NAME,
        "options": {
            "baseURL": base_url + "/v1",
            # OpenCode substitutes {file:...} when it loads the config, so
            # the key never sits in the config file and a GUI launch works
            # without a shell export ({env:...} becomes "" when unset).
            "apiKey": "{file:" + token_path + "}",
        },
        "models": opencode_models(model),
    }
    return [
        {
            "path": ["provider", OPENCODE_PROVIDER_ID],
            "name": "provider." + OPENCODE_PROVIDER_ID,
            "value": provider,
        },
        {"path": ["model"], "name": "model", "value": qualified},
        # OpenCode uses small_model for title generation and otherwise falls
        # back to a cheaper model from the provider, which the free-router
        # allowlist would reject. Pin it to the alias too.
        {"path": ["small_model"], "name": "small_model", "value": "arena/" + enabled_models(model)[0]["id"]},
    ]


def opencode_provider_restrictions(config: dict) -> list[str]:
    restrictions = []
    enabled = config.get("enabled_providers")
    disabled = config.get("disabled_providers")
    for name, value in (("enabled_providers", enabled), ("disabled_providers", disabled)):
        if value is not None and (
            not isinstance(value, list) or not all(isinstance(item, str) for item in value)
        ):
            raise LifecycleError(f"OpenCode {name} must be a list of provider names")
    if enabled is not None and OPENCODE_PROVIDER_ID not in enabled:
        restrictions.append("enabled_providers does not include arena")
    if disabled is not None and OPENCODE_PROVIDER_ID in disabled:
        restrictions.append("disabled_providers includes arena")
    return restrictions


def opencode_config_sources(cwd: str) -> list[tuple[str, str]]:
    """Local config files in OpenCode's config.ts / config/paths.ts load order."""
    home_dir = os.path.expanduser("~")
    config_home = os.environ.get("XDG_CONFIG_HOME") or os.path.join(home_dir, ".config")
    global_dir = normalize_path(os.path.join(config_home, "opencode"))
    custom_dir = (
        normalize_path(os.environ["OPENCODE_CONFIG_DIR"])
        if os.environ.get("OPENCODE_CONFIG_DIR") else None
    )
    sources = [
        (os.path.join(global_dir, name), "global")
        for name in ("config.json", "opencode.json", "opencode.jsonc")
    ]
    if os.environ.get("OPENCODE_CONFIG"):
        sources.append((normalize_path(os.environ["OPENCODE_CONFIG"]), "environment"))

    ancestors = []
    if os.environ.get("OPENCODE_DISABLE_PROJECT_CONFIG", "").lower() not in ("1", "true"):
        current = cwd
        while True:
            ancestors.append(current)
            if os.path.lexists(os.path.join(current, ".git")):
                break
            parent = os.path.dirname(current)
            if parent == current:
                break
            current = parent
    for directory in reversed(ancestors):
        for name in ("opencode.json", "opencode.jsonc"):
            sources.append((os.path.join(directory, name), "project"))

    directories = [(global_dir, "global")]
    directories.extend((os.path.join(path, ".opencode"), "project") for path in ancestors)
    directories.append((os.path.join(home_dir, ".opencode"), "home"))
    if custom_dir:
        directories.append((custom_dir, "custom"))
    seen = set()
    for directory, label in directories:
        if directory in seen:
            continue
        seen.add(directory)
        if directory.endswith(".opencode") or directory == custom_dir:
            for name in ("opencode.json", "opencode.jsonc"):
                sources.append((os.path.join(directory, name), label))
    if os.environ.get("OPENCODE_CONFIG_CONTENT"):
        sources.append(("OPENCODE_CONFIG_CONTENT", "environment"))
    managed_dir = (
        "/Library/Application Support/opencode" if sys.platform == "darwin" else "/etc/opencode"
    )
    for name in ("opencode.json", "opencode.jsonc"):
        sources.append((os.path.join(managed_dir, name), "managed"))
    return sources


def opencode_precedence(args: list[str], *, announce: bool = True) -> None:
    cwd, config_path = map(normalize_path, args)
    sources = opencode_config_sources(cwd)
    target = os.path.realpath(config_path)
    last_target = max(
        (index for index, (path, _) in enumerate(sources) if os.path.realpath(path) == target),
        default=-1,
    )
    issues = {}
    provider_lists = {}
    provider_sources = {}
    problems = []
    if os.environ.get("OPENCODE_CONFIG"):
        problems.append(f"OPENCODE_CONFIG={os.environ['OPENCODE_CONFIG']} is set in this environment")
    if os.environ.get("OPENCODE_CONFIG_CONTENT"):
        problems.append("OPENCODE_CONFIG_CONTENT is set in this environment")

    for index, (path, label) in enumerate(sources):
        source = f"{label} {path}"
        try:
            if path == "OPENCODE_CONFIG_CONTENT":
                data = json.loads(strip_jsonc(os.environ[path]))
                if not isinstance(data, dict):
                    raise LifecycleError("OpenCode config must contain a JSON object")
            else:
                if not os.path.exists(path):
                    continue
                data = load_json_object(path, "OpenCode config", jsonc=True)
            opencode_provider_restrictions(data)  # Validate each list before merging.
        except (LifecycleError, json.JSONDecodeError) as exc:
            issues.setdefault(source, []).append(str(exc))
            continue

        # OpenCode replaces each provider list only when a later config
        # supplies that same key. Writing a provider or model leaves both
        # lists inherited from earlier files in force.
        for name in ("enabled_providers", "disabled_providers"):
            if name in data:
                provider_lists[name] = data[name]
                provider_sources[name] = source
        if index > last_target:
            keys = [key for key in ("model", "small_model") if key in data]
            provider = data.get("provider")
            if isinstance(provider, dict) and OPENCODE_PROVIDER_ID in provider:
                keys.append("provider.arena")
            if keys:
                issues.setdefault(source, []).extend(keys)

    restrictions = opencode_provider_restrictions(provider_lists)
    for restriction in restrictions:
        source = provider_sources[restriction.split()[0]]
        issues.setdefault(source, []).append(restriction)
    problems.extend(f"{source}: " + ", ".join(dict.fromkeys(keys)) for source, keys in issues.items())
    if restrictions:
        raise LifecycleError(
            "OpenCode configuration blocks the Arena provider:\n  - "
            + "\n  - ".join(problems)
            + "\nAllow arena in those lists before running setup; nothing changed"
        )
    if announce:
        print("\n".join(problems))


def install_opencode(args, *, check_only=False):
    (
        requested_path,
        state_path,
        journal_path,
        arena_dir,
        token_path,
        helper_path,
        base_url,
        model,
        staged_token,
        allow_conflicts_raw,
    ) = args
    requested_path = normalize_path(requested_path)
    state_path = normalize_path(state_path)
    journal_path = normalize_path(journal_path)
    arena_dir = normalize_path(arena_dir)
    token_path = normalize_path(token_path)
    helper_path = normalize_path(helper_path)
    allow_conflicts = allow_conflicts_raw == "1"

    recover_pending(journal_path)
    updates = opencode_updates(base_url, token_path, model)
    receipt = load_receipt(state_path) if os.path.exists(state_path) else None
    section = receipt.get("opencode") if receipt else None
    changed = shared_file_conflicts(receipt) if receipt else []
    if isinstance(section, dict):
        logical_path = normalize_path(section["logical_path"])
        resolved_path = normalize_path(section["resolved_path"])
        if logical_path != requested_path:
            raise LifecycleError(
                f"OpenCode is already configured at {logical_path}; uninstall it before configuring {requested_path}"
            )
        validate_settings_topology(section, "OpenCode config")
        current = load_json_object(resolved_path, "OpenCode config", missing_ok=True, jsonc=True)
        preserved_defaults = {
            key for key in ("model", "small_model")
            if isinstance(current.get(key), str) and not current[key].startswith("arena/")
        }
        updates = [update for update in updates if update["name"] not in preserved_defaults]
        changed.extend(
            owned["name"]
            for owned in section["managed"]
            if owned["name"] not in preserved_defaults
            and leaf_state(current, owned["path"]) != owned.get("installed")
        )
        installed_mode = section.get("installed_mode")
        if os.path.isfile(resolved_path) and installed_mode is not None and file_mode(resolved_path) != installed_mode:
            changed.append("OpenCode config mode")
    else:
        logical_path = requested_path
        resolved_path = resolved_settings_path(logical_path)
        current = load_json_object(resolved_path, "OpenCode config", missing_ok=True, jsonc=True)
        section = {
            "logical_path": logical_path,
            "resolved_path": resolved_path,
            "settings_before": settings_metadata(logical_path, resolved_path),
            "installed_mode": None,
            "managed": [
                {
                    "path": update["path"],
                    "name": update["name"],
                    "before": leaf_state(current, update["path"]),
                    "installed": {"present": True, "value": copy.deepcopy(update["value"])},
                }
                for update in updates
            ],
        }
    if changed and not allow_conflicts:
        raise InstallConflict(changed)
    opencode_provider_restrictions(current)
    opencode_precedence([os.getcwd(), logical_path], announce=False)
    if receipt is None:
        receipt = make_shared_receipt(state_path, arena_dir, token_path, helper_path)
    receipt["opencode"] = section
    directories = receipt.setdefault("directories", {})
    for key, path in (
        ("opencode_logical_parent", os.path.dirname(logical_path)),
        ("opencode_resolved_parent", os.path.dirname(resolved_path)),
    ):
        if key not in directories:
            snap = snapshot_path(path)
            directories[key] = {
                "path": path,
                "existed": snap["kind"] == "directory",
                "mode": snap.get("mode"),
            }

    staged_bytes = read_staged_token(staged_token, token_path)
    snapshots = capture_paths(
        [
            arena_dir,
            os.path.dirname(logical_path),
            os.path.dirname(resolved_path),
            token_path,
            logical_path,
            resolved_path,
            state_path,
        ]
    )
    if check_only:
        return
    try:
        write_journal(journal_path, "install", snapshots)
        maybe_fail("opencode-after-journal")
        prepare_directory(journal_path, os.path.dirname(logical_path))
        prepare_directory(journal_path, os.path.dirname(resolved_path))
        place_token(journal_path, token_path, staged_bytes)
        maybe_fail("opencode-after-token")

        merged = copy.deepcopy(current)
        for update in updates:
            set_leaf(merged, update["path"], {"present": True, "value": update["value"]})
        target_mode = file_mode(resolved_path) if os.path.isfile(resolved_path) else 0o600
        content = (json.dumps(merged, indent=2) + "\n").encode()
        record_applied(
            journal_path, resolved_path, bytes_snapshot(content, target_mode)
        )
        atomic_bytes(resolved_path, content, target_mode)
        written = load_json_object(resolved_path, "installed OpenCode config")
        for update in updates:
            if leaf_state(written, update["path"]) != {
                "present": True,
                "value": update["value"],
            }:
                raise LifecycleError(
                    f"post-write verification failed for OpenCode setting {update['name']}"
                )
        maybe_fail("opencode-after-settings")

        installed_by_name = {item["name"]: item for item in section["managed"]}
        for update in updates:
            installed = {"present": True, "value": copy.deepcopy(update["value"])}
            if update["name"] in installed_by_name:
                installed_by_name[update["name"]]["installed"] = installed
                installed_by_name[update["name"]]["path"] = update["path"]
            else:
                section["managed"].append(
                    {
                        "path": update["path"],
                        "name": update["name"],
                        "before": leaf_state(current, update["path"]),
                        "installed": installed,
                    }
                )
        section["installed_mode"] = file_mode(resolved_path)
        section["models"] = model_receipt(model)
        receipt["files"]["token"]["installed"] = receipt_snapshot(token_path)
        receipt["updated_at"] = utc_now()
        record_applied(journal_path, state_path, bytes_snapshot(json_bytes(receipt), 0o600))
        atomic_json(state_path, receipt, 0o600)
        maybe_fail("opencode-after-state")

        os.unlink(journal_path)
        print(logical_path)
    except BaseException:
        rollback(journal_path)
        raise


def uninstall_opencode(args):
    state_path, journal_path = map(normalize_path, args)
    recover_pending(journal_path)
    if not os.path.exists(state_path):
        return 4
    receipt = load_receipt(state_path)
    section = receipt.get("opencode")
    if not isinstance(section, dict):
        return 4
    keep_shared = other_sections_remain(receipt, "opencode")
    logical_path = normalize_path(section["logical_path"])
    resolved_path = normalize_path(section["resolved_path"])
    before_meta = section.get("settings_before", {})

    # A replaced path (new symlink, deleted or repointed file) is the user's
    # decision; report it and leave the new referent alone.
    settings_path_conflict = (
        (not before_meta.get("logical_was_symlink") and os.path.islink(logical_path))
        or os.path.islink(resolved_path)
        or os.path.realpath(resolved_path) != resolved_path
        or not os.path.isfile(resolved_path)
    )
    current = (
        {}
        if settings_path_conflict
        else load_json_object(resolved_path, "OpenCode config", missing_ok=True, jsonc=True)
    )

    path_list = [state_path, logical_path, resolved_path]
    if not keep_shared:
        for entry in receipt.get("files", {}).values():
            path_list.append(entry["path"])
    for entry in section_directories(receipt, "opencode", keep_shared).values():
        path_list.append(entry["path"])
    snapshots = capture_paths(path_list)
    conflicts = []
    try:
        write_journal(journal_path, "uninstall", snapshots)
        maybe_fail("opencode-uninstall-after-journal")
        if settings_path_conflict:
            conflicts.append("OpenCode config path")
        else:
            restored = copy.deepcopy(current)
            for owned in section["managed"]:
                if leaf_state(restored, owned["path"]) == owned.get("installed"):
                    set_leaf(restored, owned["path"], owned["before"])
                else:
                    conflicts.append(owned["name"])
            if not before_meta.get("existed") and not restored:
                record_applied(journal_path, resolved_path, {"kind": "absent"})
                remove_non_directory(resolved_path)
            else:
                current_mode = file_mode(resolved_path)
                installed_mode = section.get("installed_mode")
                if before_meta.get("existed") and current_mode == installed_mode:
                    desired_mode = before_meta.get("mode") or 0o600
                else:
                    desired_mode = current_mode
                    if installed_mode is not None and current_mode != installed_mode:
                        conflicts.append("OpenCode config mode")
                record_applied(
                    journal_path,
                    resolved_path,
                    bytes_snapshot(json_bytes(restored), desired_mode),
                )
                atomic_json(resolved_path, restored, desired_mode)
        maybe_fail("opencode-uninstall-after-settings")

        token = receipt["files"]["token"]
        config_paths = dict.fromkeys(token.get("opencode_configs", []) + [logical_path, resolved_path])
        references = [
            path for path in config_paths if opencode_config_references_token(path, token["path"])
        ]
        if references:
            # Keep this dependency after releasing the OpenCode section, so
            # uninstalling Claude later also preserves a still-needed token.
            token["opencode_configs"] = references
            conflicts.append("token referenced by OpenCode")
        else:
            token.pop("opencode_configs", None)

        if not keep_shared:
            restore_shared_files(receipt, conflicts, journal_path)
        maybe_fail("opencode-uninstall-after-files")

        release_section(receipt, "opencode", state_path, journal_path)
        maybe_fail("opencode-uninstall-after-state")
        os.unlink(journal_path)

        directory_entries = sorted(
            section_directories(receipt, "opencode", keep_shared).values(),
            key=lambda item: normalize_path(item["path"]).count(os.sep),
            reverse=True,
        )
        for entry in directory_entries:
            path = normalize_path(entry["path"])
            if not entry.get("existed") and os.path.isdir(path) and not os.path.islink(path):
                try:
                    os.rmdir(path)
                except OSError:
                    pass

        for name in dict.fromkeys(conflicts):
            print(f"PRESERVED {name}")
        return 0
    except BaseException:
        rollback(journal_path)
        raise


# ---------------------------------------------------------------------------
# Codex
# ---------------------------------------------------------------------------
#
# Codex keeps its settings in TOML at $CODEX_HOME/config.toml. The Python that
# ships with macOS has no TOML support (tomllib arrived in 3.11 and only
# reads), so this module edits the file line by line and owns only its own
# keys: three top-level scalars before the first table header, and the two
# [model_providers.arena*] tables as one unit. Every other line is copied
# through unchanged. Shapes the editor cannot own (an inline model_providers
# table, dotted model_providers.arena.x keys, arrays of tables, sub-tables of
# the arena provider it did not write) make it refuse and change nothing.

CODEX_PROVIDER_ID = "arena"
CODEX_PROVIDER_NAME = "Arena"
CODEX_PROVIDER_TABLE = "model_providers." + CODEX_PROVIDER_ID
CODEX_AUTH_TABLE = CODEX_PROVIDER_TABLE + ".auth"
CODEX_TABLES = (CODEX_PROVIDER_TABLE, CODEX_AUTH_TABLE)
# Owned tables keyed by their decoded key segments. A quoted segment such as
# [model_providers."arena.auth"] is a different provider whose id contains a
# dot, so ownership is decided on segments, never on a dotted string.
CODEX_TABLE_PARTS = {
    ("model_providers", CODEX_PROVIDER_ID): CODEX_PROVIDER_TABLE,
    ("model_providers", CODEX_PROVIDER_ID, "auth"): CODEX_AUTH_TABLE,
}
CODEX_TOP_LEVEL_KEYS = ("model", "model_provider", "model_context_window", "model_catalog_json", "model_reasoning_effort")
# Codex's /model picker lists only the catalog it knows. model_catalog_json
# replaces that bundled catalog with the caller's enabled models, including
# the router alias, and removes the "model metadata not found" warning.
CODEX_CATALOG_FILE = "codex-models.json"
# Codex has a bundled catalog for OpenAI models and falls back to generic
# metadata for unknown ids, so the router alias needs its window declared or
# the context gauge and auto-compaction are wrong. Same 1M floor as OpenCode.
CODEX_CONTEXT_WINDOW = 1000000


# Codex rejects a catalog model without an instruction template, and a model
# outside its bundled catalog gets this built-in prompt (BASE_INSTRUCTIONS in
# codex-rs/models-manager/src/model_info.rs). Shipping the same text keeps the
# alias behaving exactly as it did before the catalog existed. Copied verbatim
# from codex-rs/models-manager/prompt.md in openai/codex at commit 7498521d
# (Apache-2.0). Refresh it when the pinned Codex version moves.
CODEX_BASE_INSTRUCTIONS = r"""You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI. You are expected to be precise, safe, and helpful.

Your capabilities:

- Receive user prompts and other context provided by the harness, such as files in the workspace.
- Communicate with the user by streaming thinking & responses, and by making & updating plans.
- Emit function calls to run terminal commands and apply patches. Depending on how this specific run is configured, you can request that these function calls be escalated to the user for approval before running. More on this in the "Sandbox and approvals" section.

Within this context, Codex refers to the open-source agentic coding interface (not the old Codex language model built by OpenAI).

# How you work

## Personality

Your default personality and tone is concise, direct, and friendly. You communicate efficiently, always keeping the user clearly informed about ongoing actions without unnecessary detail. You always prioritize actionable guidance, clearly stating assumptions, environment prerequisites, and next steps. Unless explicitly asked, you avoid excessively verbose explanations about your work.

# AGENTS.md spec
- Repos often contain AGENTS.md files. These files can appear anywhere within the repository.
- These files are a way for humans to give you (the agent) instructions or tips for working within the container.
- Some examples might be: coding conventions, info about how code is organized, or instructions for how to run or test code.
- Instructions in AGENTS.md files:
    - The scope of an AGENTS.md file is the entire directory tree rooted at the folder that contains it.
    - For every file you touch in the final patch, you must obey instructions in any AGENTS.md file whose scope includes that file.
    - Instructions about code style, structure, naming, etc. apply only to code within the AGENTS.md file's scope, unless the file states otherwise.
    - More-deeply-nested AGENTS.md files take precedence in the case of conflicting instructions.
    - Direct system/developer/user instructions (as part of a prompt) take precedence over AGENTS.md instructions.
- The contents of the AGENTS.md file at the root of the repo and any directories from the CWD up to the root are included with the developer message and don't need to be re-read. When working in a subdirectory of CWD, or a directory outside the CWD, check for any AGENTS.md files that may be applicable.

## Responsiveness

### Preamble messages

Before making tool calls, send a brief preamble to the user explaining what you’re about to do. When sending preamble messages, follow these principles and examples:

- **Logically group related actions**: if you’re about to run several related commands, describe them together in one preamble rather than sending a separate note for each.
- **Keep it concise**: be no more than 1-2 sentences, focused on immediate, tangible next steps. (8–12 words for quick updates).
- **Build on prior context**: if this is not your first tool call, use the preamble message to connect the dots with what’s been done so far and create a sense of momentum and clarity for the user to understand your next actions.
- **Keep your tone light, friendly and curious**: add small touches of personality in preambles feel collaborative and engaging.
- **Exception**: Avoid adding a preamble for every trivial read (e.g., `cat` a single file) unless it’s part of a larger grouped action.

**Examples:**

- “I’ve explored the repo; now checking the API route definitions.”
- “Next, I’ll patch the config and update the related tests.”
- “I’m about to scaffold the CLI commands and helper functions.”
- “Ok cool, so I’ve wrapped my head around the repo. Now digging into the API routes.”
- “Config’s looking tidy. Next up is patching helpers to keep things in sync.”
- “Finished poking at the DB gateway. I will now chase down error handling.”
- “Alright, build pipeline order is interesting. Checking how it reports failures.”
- “Spotted a clever caching util; now hunting where it gets used.”

## Planning

You have access to an `update_plan` tool which tracks steps and progress and renders them to the user. Using the tool helps demonstrate that you've understood the task and convey how you're approaching it. Plans can help to make complex, ambiguous, or multi-phase work clearer and more collaborative for the user. A good plan should break the task into meaningful, logically ordered steps that are easy to verify as you go.

Note that plans are not for padding out simple work with filler steps or stating the obvious. The content of your plan should not involve doing anything that you aren't capable of doing (i.e. don't try to test things that you can't test). Do not use plans for simple or single-step queries that you can just do or answer immediately.

Do not repeat the full contents of the plan after an `update_plan` call — the harness already displays it. Instead, summarize the change made and highlight any important context or next step.

Before running a command, consider whether or not you have completed the previous step, and make sure to mark it as completed before moving on to the next step. It may be the case that you complete all steps in your plan after a single pass of implementation. If this is the case, you can simply mark all the planned steps as completed. Sometimes, you may need to change plans in the middle of a task: call `update_plan` with the updated plan and make sure to provide an `explanation` of the rationale when doing so.

Use a plan when:

- The task is non-trivial and will require multiple actions over a long time horizon.
- There are logical phases or dependencies where sequencing matters.
- The work has ambiguity that benefits from outlining high-level goals.
- You want intermediate checkpoints for feedback and validation.
- When the user asked you to do more than one thing in a single prompt
- The user has asked you to use the plan tool (aka "TODOs")
- You generate additional steps while working, and plan to do them before yielding to the user

### Examples

**High-quality plans**

Example 1:

1. Add CLI entry with file args
2. Parse Markdown via CommonMark library
3. Apply semantic HTML template
4. Handle code blocks, images, links
5. Add error handling for invalid files

Example 2:

1. Define CSS variables for colors
2. Add toggle with localStorage state
3. Refactor components to use variables
4. Verify all views for readability
5. Add smooth theme-change transition

Example 3:

1. Set up Node.js + WebSocket server
2. Add join/leave broadcast events
3. Implement messaging with timestamps
4. Add usernames + mention highlighting
5. Persist messages in lightweight DB
6. Add typing indicators + unread count

**Low-quality plans**

Example 1:

1. Create CLI tool
2. Add Markdown parser
3. Convert to HTML

Example 2:

1. Add dark mode toggle
2. Save preference
3. Make styles look good

Example 3:

1. Create single-file HTML game
2. Run quick sanity check
3. Summarize usage instructions

If you need to write a plan, only write high quality plans, not low quality ones.

## Task execution

You are a coding agent. Please keep going until the query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved. Autonomously resolve the query to the best of your ability, using the tools available to you, before coming back to the user. Do NOT guess or make up an answer.

You MUST adhere to the following criteria when solving queries:

- Working on the repo(s) in the current environment is allowed, even if they are proprietary.
- Analyzing code for vulnerabilities is allowed.
- Showing user code and tool call details is allowed.
- Use the `apply_patch` tool to edit files (NEVER try `applypatch` or `apply-patch`, only `apply_patch`): {"command":["apply_patch","*** Begin Patch\\n*** Update File: path/to/file.py\\n@@ def example():\\n- pass\\n+ return 123\\n*** End Patch"]}

If completing the user's task requires writing or modifying files, your code and final answer should follow these coding guidelines, though user instructions (i.e. AGENTS.md) may override these guidelines:

- Fix the problem at the root cause rather than applying surface-level patches, when possible.
- Avoid unneeded complexity in your solution.
- Do not attempt to fix unrelated bugs or broken tests. It is not your responsibility to fix them. (You may mention them to the user in your final message though.)
- Update documentation as necessary.
- Keep changes consistent with the style of the existing codebase. Changes should be minimal and focused on the task.
- Use `git log` and `git blame` to search the history of the codebase if additional context is required.
- NEVER add copyright or license headers unless specifically requested.
- Do not waste tokens by re-reading files after calling `apply_patch` on them. The tool call will fail if it didn't work. The same goes for making folders, deleting folders, etc.
- Do not `git commit` your changes or create new git branches unless explicitly requested.
- Do not add inline comments within code unless explicitly requested.
- Do not use one-letter variable names unless explicitly requested.
- NEVER output inline citations like "【F:README.md†L5-L14】" in your outputs. The CLI is not able to render these so they will just be broken in the UI. Instead, if you output valid filepaths, users will be able to click on them to open the files in their editor.

## Validating your work

If the codebase has tests or the ability to build or run, consider using them to verify that your work is complete. 

When testing, your philosophy should be to start as specific as possible to the code you changed so that you can catch issues efficiently, then make your way to broader tests as you build confidence. If there's no test for the code you changed, and if the adjacent patterns in the codebases show that there's a logical place for you to add a test, you may do so. However, do not add tests to codebases with no tests.

Similarly, once you're confident in correctness, you can suggest or use formatting commands to ensure that your code is well formatted. If there are issues you can iterate up to 3 times to get formatting right, but if you still can't manage it's better to save the user time and present them a correct solution where you call out the formatting in your final message. If the codebase does not have a formatter configured, do not add one.

For all of testing, running, building, and formatting, do not attempt to fix unrelated bugs. It is not your responsibility to fix them. (You may mention them to the user in your final message though.)

Be mindful of whether to run validation commands proactively. In the absence of behavioral guidance:

- When running in the non-interactive approval mode **never**, proactively run tests, lint and do whatever you need to ensure you've completed the task.
- When working in interactive approval modes like **untrusted**, or **on-request**, hold off on running tests or lint commands until the user is ready for you to finalize your output, because these commands take time to run and slow down iteration. Instead suggest what you want to do next, and let the user confirm first.
- When working on test-related tasks, such as adding tests, fixing tests, or reproducing a bug to verify behavior, you may proactively run tests regardless of approval mode. Use your judgement to decide whether this is a test-related task.

## Ambition vs. precision

For tasks that have no prior context (i.e. the user is starting something brand new), you should feel free to be ambitious and demonstrate creativity with your implementation.

If you're operating in an existing codebase, you should make sure you do exactly what the user asks with surgical precision. Treat the surrounding codebase with respect, and don't overstep (i.e. changing filenames or variables unnecessarily). You should balance being sufficiently ambitious and proactive when completing tasks of this nature.

You should use judicious initiative to decide on the right level of detail and complexity to deliver based on the user's needs. This means showing good judgment that you're capable of doing the right extras without gold-plating. This might be demonstrated by high-value, creative touches when scope of the task is vague; while being surgical and targeted when scope is tightly specified.

## Sharing progress updates

For especially longer tasks that you work on (i.e. requiring many tool calls, or a plan with multiple steps), you should provide progress updates back to the user at reasonable intervals. These updates should be structured as a concise sentence or two (no more than 8-10 words long) recapping progress so far in plain language: this update demonstrates your understanding of what needs to be done, progress so far (i.e. files explores, subtasks complete), and where you're going next.

Before doing large chunks of work that may incur latency as experienced by the user (i.e. writing a new file), you should send a concise message to the user with an update indicating what you're about to do to ensure they know what you're spending time on. Don't start editing or writing large files before informing the user what you are doing and why.

The messages you send before tool calls should describe what is immediately about to be done next in very concise language. If there was previous work done, this preamble message should also include a note about the work done so far to bring the user along.

## Presenting your work and final message

Your final message should read naturally, like an update from a concise teammate. For casual conversation, brainstorming tasks, or quick questions from the user, respond in a friendly, conversational tone. You should ask questions, suggest ideas, and adapt to the user’s style. If you've finished a large amount of work, when describing what you've done to the user, you should follow the final answer formatting guidelines to communicate substantive changes. You don't need to add structured formatting for one-word answers, greetings, or purely conversational exchanges.

You can skip heavy formatting for single, simple actions or confirmations. In these cases, respond in plain sentences with any relevant next step or quick option. Reserve multi-section structured responses for results that need grouping or explanation.

The user is working on the same computer as you, and has access to your work. As such there's no need to show the full contents of large files you have already written unless the user explicitly asks for them. Similarly, if you've created or modified files using `apply_patch`, there's no need to tell users to "save the file" or "copy the code into a file"—just reference the file path.

If there's something that you think you could help with as a logical next step, concisely ask the user if they want you to do so. Good examples of this are running tests, committing changes, or building out the next logical component. If there’s something that you couldn't do (even with approval) but that the user might want to do (such as verifying changes by running the app), include those instructions succinctly.

Brevity is very important as a default. You should be very concise (i.e. no more than 10 lines), but can relax this requirement for tasks where additional detail and comprehensiveness is important for the user's understanding.

### Final answer structure and style guidelines

You are producing plain text that will later be styled by the CLI. Follow these rules exactly. Formatting should make results easy to scan, but not feel mechanical. Use judgment to decide how much structure adds value.

**Section Headers**

- Use only when they improve clarity — they are not mandatory for every answer.
- Choose descriptive names that fit the content
- Keep headers short (1–3 words) and in `**Title Case**`. Always start headers with `**` and end with `**`
- Leave no blank line before the first bullet under a header.
- Section headers should only be used where they genuinely improve scanability; avoid fragmenting the answer.

**Bullets**

- Use `-` followed by a space for every bullet.
- Merge related points when possible; avoid a bullet for every trivial detail.
- Keep bullets to one line unless breaking for clarity is unavoidable.
- Group into short lists (4–6 bullets) ordered by importance.
- Use consistent keyword phrasing and formatting across sections.

**Monospace**

- Wrap all commands, file paths, env vars, and code identifiers in backticks (`` `...` ``).
- Apply to inline examples and to bullet keywords if the keyword itself is a literal file/command.
- Never mix monospace and bold markers; choose one based on whether it’s a keyword (`**`) or inline code/path (`` ` ``).

**File References**
When referencing files in your response, make sure to include the relevant start line and always follow the below rules:
  * Use inline code to make file paths clickable.
  * Each reference should have a stand alone path. Even if it's the same file.
  * Accepted: absolute, workspace‑relative, a/ or b/ diff prefixes, or bare filename/suffix.
  * Line/column (1‑based, optional): :line[:column] or #Lline[Ccolumn] (column defaults to 1).
  * Do not use URIs like file://, vscode://, or https://.
  * Do not provide range of lines
  * Examples: src/app.ts, src/app.ts:42, b/server/index.js#L10, C:\repo\project\main.rs:12:5

**Structure**

- Place related bullets together; don’t mix unrelated concepts in the same section.
- Order sections from general → specific → supporting info.
- For subsections (e.g., “Binaries” under “Rust Workspace”), introduce with a bolded keyword bullet, then list items under it.
- Match structure to complexity:
  - Multi-part or detailed results → use clear headers and grouped bullets.
  - Simple results → minimal headers, possibly just a short list or paragraph.

**Tone**

- Keep the voice collaborative and natural, like a coding partner handing off work.
- Be concise and factual — no filler or conversational commentary and avoid unnecessary repetition
- Use present tense and active voice (e.g., “Runs tests” not “This will run tests”).
- Keep descriptions self-contained; don’t refer to “above” or “below”.
- Use parallel structure in lists for consistency.

**Don’t**

- Don’t use literal words “bold” or “monospace” in the content.
- Don’t nest bullets or create deep hierarchies.
- Don’t output ANSI escape codes directly — the CLI renderer applies them.
- Don’t cram unrelated keywords into a single bullet; split for clarity.
- Don’t let keyword lists run long — wrap or reformat for scanability.

Generally, ensure your final answers adapt their shape and depth to the request. For example, answers to code explanations should have a precise, structured explanation with code references that answer the question directly. For tasks with a simple implementation, lead with the outcome and supplement only with what’s needed for clarity. Larger changes can be presented as a logical walkthrough of your approach, grouping related steps, explaining rationale where it adds value, and highlighting next actions to accelerate the user. Your answers should provide the right level of detail while being easily scannable.

For casual greetings, acknowledgements, or other one-off conversational messages that are not delivering substantive information or structured results, respond naturally without section headers or bullet formatting.

# Tool Guidelines

## Shell commands

When using the shell, you must adhere to the following guidelines:

- When searching for text or files, prefer using `rg` or `rg --files` respectively because `rg` is much faster than alternatives like `grep`. (If the `rg` command is not found, then use alternatives.)
- Do not use python scripts to attempt to output larger chunks of a file.

## `update_plan`

A tool named `update_plan` is available to you. You can use it to keep an up‑to‑date, step‑by‑step plan for the task.

To create a new plan, call `update_plan` with a short list of 1‑sentence steps (no more than 5-7 words each) with a `status` for each step (`pending`, `in_progress`, or `completed`).

When steps have been completed, use `update_plan` to mark each finished step as `completed` and the next step you are working on as `in_progress`. There should always be exactly one `in_progress` step until everything is done. You can mark multiple items as complete in a single `update_plan` call.

If all steps are complete, ensure you call `update_plan` to mark all steps as `completed`.
"""


def codex_catalog_bytes(model):
    """A ModelsResponse document (codex-rs/protocol/src/openai_models.rs).

    Field spellings follow that file's serde attributes: shell_type and
    truncation mode are snake_case, visibility and modalities lowercase.
    """
    entry = {
        "slug": model,
        "display_name": "Arena Coding Router",
        "description": None,
        # Do not advertise a client-selected reasoning level for the router.
        # With no supported levels Codex's /model applies the alias on Enter
        # and never opens "Select Reasoning Level" (open_all_models_popup_with_view_id
        # and open_reasoning_popup in codex-rs/tui/src/chatwidget/model_popups.rs
        # at rust-v0.157.0: an empty list collapses to the single default). The
        # default still travels as reasoning.effort on every request
        # (build_reasoning in codex-rs/core/src/client.rs), exactly as the old
        # three-level catalog's default did.
        "default_reasoning_level": "medium",
        "supported_reasoning_levels": [],
        "shell_type": "default",
        "visibility": "list",
        "supported_in_api": True,
        "priority": 0,
        "availability_nux": None,
        "upgrade": None,
        # Codex 0.144.4 requires the legacy prompt and capability fields;
        # retain model_messages for newer clients using the same prompt.
        "base_instructions": CODEX_BASE_INSTRUCTIONS,
        "model_messages": {"instructions_template": CODEX_BASE_INSTRUCTIONS},
        "supports_parallel_tool_calls": False,
        "support_verbosity": False,
        "default_verbosity": None,
        "apply_patch_tool_type": None,
        "truncation_policy": {"mode": "tokens", "limit": 10000},
        "context_window": CODEX_CONTEXT_WINDOW,
        "experimental_supported_tools": [],
        "input_modalities": ["text", "image"],
    }
    effort_descriptions = {
        "none": "No extended thinking",
        "minimal": "Minimal thinking",
        "low": "Fastest responses",
        "medium": "Balanced speed and reasoning",
        "high": "Deeper reasoning",
        "xhigh": "More thorough reasoning",
        "max": "Deepest reasoning",
    }
    entries = []
    for index, row in enumerate(enabled_models(model)):
        model_entry = {
            **entry,
            "slug": row["id"], "display_name": row["name"],
            "priority": index, "context_window": row["context"],
            "input_modalities": row["input_modalities"],
            "default_reasoning_level": entry["default_reasoning_level"] if row["reasoning"] else None,
            "supports_reasoning_summary_parameter": row["reasoning"],
        }
        if row["id"] not in ROUTER_MODEL_IDS:
            efforts = row.get("reasoning_efforts", [])
            model_entry.update({
                "supported_reasoning_levels": [
                    {"effort": effort, "description": effort_descriptions[effort]} for effort in efforts
                ],
                "default_reasoning_level": row.get("default_reasoning_effort"),
                "supports_reasoning_summary_parameter": bool(efforts),
                "support_verbosity": False,
            })
            model_entry.pop("default_verbosity")
            model_entry.pop("apply_patch_tool_type")
        # Compatibility with clients predating supports_reasoning_summary_parameter.
        model_entry["supports_reasoning_summaries"] = model_entry["supports_reasoning_summary_parameter"]
        entries.append(model_entry)
    return (json.dumps({"models": entries}, indent=2) + "\n").encode()


def codex_update_state(update: dict) -> dict:
    return {"present": False} if update.get("remove") else {"present": True, "value": copy.deepcopy(update["value"])}


def codex_updates(base_url, helper_path, model, catalog_path):
    provider = {
        # Anything but "OpenAI": that literal name turns on model discovery
        # against a response shape Codex does not understand.
        "name": CODEX_PROVIDER_NAME,
        # Codex appends /responses to the API root.
        "base_url": base_url + "/v1",
        "wire_api": "responses",
        # Skip the ChatGPT login screen; the key comes from the auth command.
        "requires_openai_auth": False,
        # Explicit even though it is the default: with it on, Codex probes a
        # WebSocket endpoint the gateway rejects and stalls each turn.
        "supports_websockets": False,
    }
    # Codex runs the command with no stdin, reads the token from stdout, and
    # reruns it every five minutes, so rotation needs no restart and a GUI
    # launch with no shell environment still authenticates. env_key needs a
    # shell export the installer never writes; experimental_bearer_token puts
    # the key in the file in plaintext.
    auth = {"command": helper_path}
    updates = [
        {"path": ["model"], "name": "model", "value": model},
        {"path": ["model_provider"], "name": "model_provider", "value": CODEX_PROVIDER_ID},
        # Codex requires an absolute path here and reads the file at startup.
        {"path": ["model_catalog_json"], "name": "model_catalog_json", "value": catalog_path},
        {
            "path": ["model_providers", CODEX_PROVIDER_ID],
            "name": CODEX_PROVIDER_TABLE,
            "value": {CODEX_PROVIDER_TABLE: provider, CODEX_AUTH_TABLE: auth},
        },
    ]

    if any(row["id"] not in ROUTER_MODEL_IDS for row in enabled_models(model)):
        updates.extend({"path": [key], "name": key, "remove": True}
                       for key in ("model_context_window", "model_reasoning_effort"))
    return updates


_TOML_KEY_PART = r'(?:[A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|\'[^\']*\')'
_TOML_KEY_LINE = re.compile(
    r"^\s*(" + _TOML_KEY_PART + r"(?:\s*\.\s*" + _TOML_KEY_PART + r")*)\s*=\s*(.*)$"
)
_TOML_KEY_TOKENS = re.compile(_TOML_KEY_PART)
_TOML_SCALAR = re.compile(
    r'^(?:(?P<basic>"(?:\\.|[^"\\])*")|(?P<literal>\'[^\']*\')|(?P<bool>true|false)'
    r"|(?P<float>[+-]?\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?|[+-]?\d[\d_]*[eE][+-]?\d+)"
    r"|(?P<int>[+-]?(?:0|[1-9](?:_?\d)*)))"
)


_TOML_BASIC_ESCAPE = re.compile(r'\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[btnfr"\\])')
_TOML_SIMPLE_ESCAPES = {"b": "\b", "t": "\t", "n": "\n", "f": "\f", "r": "\r", '"': '"', "\\": "\\"}


def toml_decode_basic(token):
    """Decode a quoted TOML basic string, including \\UXXXXXXXX escapes.

    JSON decoding is not enough: TOML has the eight-digit \\U form and no
    surrogate pairs. An escape TOML does not define raises ValueError.
    """
    body = token[1:-1]
    out = []
    index = 0
    while index < len(body):
        char = body[index]
        if char != "\\":
            out.append(char)
            index += 1
            continue
        match = _TOML_BASIC_ESCAPE.match(body, index)
        if not match:
            raise ValueError("unsupported escape in TOML string")
        escape = match.group(1)
        if escape[0] in "uU":
            code_point = int(escape[1:], 16)
            if 0xD800 <= code_point <= 0xDFFF or code_point > 0x10FFFF:
                raise ValueError("escape is not a Unicode scalar value")
            out.append(chr(code_point))
        else:
            out.append(_TOML_SIMPLE_ESCAPES[escape])
        index = match.end()
    return "".join(out)


_TOML_HEADER_OPEN = re.compile(r"^\s*(\[\[|\[)\s*")
_TOML_WS = re.compile(r"\s*")


def parse_table_header(line):
    """Decode a `[table]` or `[[array]]` header, or return None for a non-header line.

    Key segments are tokenised the way TOML does, so a quoted segment may
    contain `]`, `#` or dots. Anything after the closing bracket other than
    whitespace or a comment, or a header the tokenizer cannot consume, is
    refused rather than guessed at.
    """
    opened = _TOML_HEADER_OPEN.match(line)
    if not opened:
        return None
    is_array = opened.group(1) == "[["
    position = opened.end()
    parts = []
    while True:
        token = _TOML_KEY_TOKENS.match(line, position)
        if not token:
            raise LifecycleError(f"Codex config has a table header the installer cannot read: {line.strip()[:60]}")
        parts.extend(toml_key_parts(token.group(0)))
        position = _TOML_WS.match(line, token.end()).end()
        if position < len(line) and line[position] == ".":
            position = _TOML_WS.match(line, position + 1).end()
            continue
        break
    closing = "]]" if is_array else "]"
    if not line.startswith(closing, position) or not re.match(r"^\s*(#.*)?$", line[position + len(closing):]):
        raise LifecycleError(f"Codex config has a table header the installer cannot read: {line.strip()[:60]}")
    return parts, is_array


def toml_key_parts(raw):
    parts = []
    for token in _TOML_KEY_TOKENS.findall(raw):
        if token.startswith('"'):
            try:
                parts.append(toml_decode_basic(token))
            except ValueError as exc:
                raise LifecycleError(f"Codex config has a key with an escape the installer cannot read: {token}") from exc
        elif token.startswith("'"):
            parts.append(token[1:-1])
        else:
            parts.append(token)
    return parts


def toml_parse_scalar(text):
    """Parse one scalar value; (value, True) or (None, False) when unsupported."""
    text = text.strip()
    # Single-line triple-quoted strings are ordinary values to Codex.
    triple_basic = re.match(r'^"""((?:[^"\\]|\\.|"(?!""))*)"""\s*(?:#.*)?$', text)
    if triple_basic:
        try:
            return toml_decode_basic('"' + triple_basic.group(1) + '"'), True
        except ValueError:
            return None, False
    triple_literal = re.match(r"^'''(.*?)'''\s*(?:#.*)?$", text)
    if triple_literal:
        return triple_literal.group(1), True
    if text.startswith(('"""', "'''")):
        return None, False
    match = _TOML_SCALAR.match(text)
    if not match or not re.match(r"^\s*(#.*)?$", text[match.end():]):
        return None, False
    if match.group("basic") is not None:
        try:
            return toml_decode_basic(match.group("basic")), True
        except ValueError:
            return None, False
    if match.group("literal") is not None:
        return match.group("literal")[1:-1], True
    if match.group("bool") is not None:
        return match.group("bool") == "true", True
    if match.group("float") is not None:
        return float(match.group("float").replace("_", "")), True
    return int(match.group("int").replace("_", "")), True


def toml_dump_scalar(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        # JSON escapes for control characters, quotes and backslashes are
        # valid TOML basic-string escapes. Non-ASCII is written as UTF-8:
        # json.dumps would otherwise emit UTF-16 surrogate pairs for
        # characters outside the BMP, which TOML rejects. DEL is the one
        # character JSON leaves raw that TOML requires escaped.
        return json.dumps(value, ensure_ascii=False).replace("\x7f", "\\u007f")
    raise LifecycleError(f"cannot write TOML value {value!r}")


def toml_closes_multiline(text, delimiter, start=0):
    """Whether an unescaped closing delimiter appears in text from start onward.

    In a basic multi-line string a backslash escapes the next character, so a
    backslash followed by three quotes is an escaped quote plus two quotes,
    not a delimiter. Literal multi-line strings have no escapes.
    """
    if delimiter == "'''":
        return delimiter in text[start:]
    index = start
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text.startswith(delimiter, index):
            return True
        index += 1
    return False


def toml_multiline_open(value_text):
    """The closing delimiter when a value opens a multi-line string, else None."""
    value_text = value_text.strip()
    for delimiter in ('"""', "'''"):
        if value_text.startswith(delimiter) and not toml_closes_multiline(value_text, delimiter, 3):
            return delimiter
    return None


def parse_codex_toml(text):
    lines = text.split("\n")
    doc = {"lines": lines, "top": {}, "tables": [], "header_index": None}
    current = None
    closing = None
    pending = None
    for index, line in enumerate(lines):
        if closing is not None:
            if toml_closes_multiline(line, closing):
                closing = None
                pending["end"] = index
                pending = None
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        header = parse_table_header(line)
        if header:
            header_parts, array_header = header
            if current is not None:
                current["end"] = index
            current = {
                "name": ".".join(header_parts),
                "parts": tuple(header_parts),
                "kind": "array" if array_header else "table",
                "start": index,
                "end": len(lines),
                "entries": {},
            }
            doc["tables"].append(current)
            if doc["header_index"] is None:
                doc["header_index"] = index
            continue
        key_line = _TOML_KEY_LINE.match(line)
        if not key_line:
            raise LifecycleError(f"Codex config has a line the installer cannot read: {stripped[:60]}")
        key_parts = toml_key_parts(key_line.group(1))
        value, ok = toml_parse_scalar(key_line.group(2))
        # "end" is the last line of the value: the same line for scalars, the
        # closing-delimiter line for a multi-line string.
        entry = {"line": index, "end": index, "parts": tuple(key_parts), "value": value, "ok": ok, "raw": line}
        # Keyed by decoded segments: `a.b = 1` and `"a.b" = 1` are different keys.
        (doc["top"] if current is None else current["entries"])[tuple(key_parts)] = entry
        closing = toml_multiline_open(key_line.group(2))
        if closing is not None:
            pending = entry
    if closing is not None:
        raise LifecycleError("Codex config has an unterminated multi-line string")
    return doc


def validate_codex_toml(doc, path):
    """Refuse shapes of model_providers the line editor does not own."""
    problems = []
    for key, entry in doc["top"].items():
        if entry["parts"][:1] == ("model_providers",):
            problems.append(f"top-level key {'.'.join(key)}")
    owned_seen = {}
    for table in doc["tables"]:
        name = table["name"]
        parts = table["parts"]
        if table["kind"] == "array" and parts[:1] == ("model_providers",):
            problems.append(f"[[{name}]]")
        elif parts == ("model_providers",):
            for key, entry in table["entries"].items():
                if entry["parts"][:1] == (CODEX_PROVIDER_ID,):
                    problems.append(f"[model_providers] {'.'.join(key)}")
        elif parts in CODEX_TABLE_PARTS:
            owned_seen[name] = owned_seen.get(name, 0) + 1
        elif parts[:2] == ("model_providers", CODEX_PROVIDER_ID):
            problems.append(f"[{name}]")
    problems.extend(f"duplicate [{name}]" for name, count in owned_seen.items() if count > 1)
    if problems:
        raise LifecycleError(
            f"Codex config declares the {CODEX_PROVIDER_ID} provider in a shape this installer does not edit "
            f"({', '.join(problems)}) at {path}; move it into a plain [{CODEX_PROVIDER_TABLE}] table "
            "or remove it, then run setup again; nothing changed"
        )


def load_codex_document(path, label, *, missing_ok=False):
    if not os.path.lexists(path):
        if missing_ok:
            return parse_codex_toml("")
        raise LifecycleError(f"{label} does not exist: {path}")
    # A FIFO or device would block open(); a directory would fail later. Only
    # a regular file (through symlinks) is editable.
    if not os.path.isfile(path):
        raise LifecycleError(f"{label} is not a regular file: {path}")
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except (OSError, UnicodeDecodeError) as exc:
        raise LifecycleError(f"{label} could not be read ({path}): {exc}") from exc
    doc = parse_codex_toml(text)
    validate_codex_toml(doc, path)
    return doc


def codex_entry_value(entry):
    return entry["value"] if entry["ok"] else {"raw": entry["raw"].strip()}


def codex_leaf_state(doc, name):
    """Before/Installed/Current state of one owned leaf, with the raw text for restore."""
    if name in CODEX_TOP_LEVEL_KEYS:
        entry = doc["top"].get((name,))
        if entry is None:
            return {"present": False}
        return {"present": True, "value": codex_entry_value(entry), "raw": entry["raw"]}
    blocks = [table for table in doc["tables"] if table["parts"] in CODEX_TABLE_PARTS]
    if not blocks:
        return {"present": False}
    value = {}
    raw = []
    for table in sorted(blocks, key=lambda item: item["start"]):
        value[CODEX_TABLE_PARTS[table["parts"]]] = {
            ".".join(key): codex_entry_value(entry) for key, entry in table["entries"].items()
        }
        raw.extend(doc["lines"][table["start"]:table["end"]])
    return {"present": True, "value": value, "raw": raw}


def codex_state_equal(current, expected):
    if not isinstance(current, dict) or not isinstance(expected, dict):
        return False
    if bool(current.get("present")) != bool(expected.get("present")):
        return False
    return not current.get("present") or current.get("value") == expected.get("value")


def codex_render_tables(value):
    out = []
    for name in CODEX_TABLES:
        entries = value.get(name)
        if entries is None:
            continue
        if out:
            out.append("")
        out.append("[" + name + "]")
        out.extend(key + " = " + toml_dump_scalar(item) for key, item in entries.items())
    return out


def codex_apply(doc, name, state):
    """Lines of the document with one owned leaf set to state (present or absent)."""
    lines = codex_apply_lines(doc, name, state)
    # The file always ends with a newline once the installer has edited it.
    if lines and lines[-1].strip():
        lines.append("")
    return lines


def codex_apply_lines(doc, name, state):
    lines = list(doc["lines"])
    if name in CODEX_TOP_LEVEL_KEYS:
        entry = doc["top"].get((name,))
        if not state.get("present"):
            if entry is not None:
                del lines[entry["line"]]
            return lines
        if isinstance(state.get("raw"), str):
            new_line = state["raw"]
        else:
            new_line = name + " = " + toml_dump_scalar(state["value"])
        if entry is not None:
            lines[entry["line"]] = new_line
            return lines
        top_lines = [item["end"] for item in doc["top"].values()]
        if top_lines:
            at = max(top_lines) + 1
        elif doc["header_index"] is None:
            at = len(lines)
            while at > 0 and lines[at - 1].strip() == "":
                at -= 1
        else:
            at = doc["header_index"]
            while at > 0 and lines[at - 1].strip() == "":
                at -= 1
        # No separator line: removal deletes exactly the line that was added,
        # so a file whose top-level keys run straight into a header restores
        # byte for byte on uninstall.
        lines.insert(at, new_line)
        return lines

    blocks = sorted(
        (table for table in doc["tables"] if table["parts"] in CODEX_TABLE_PARTS),
        key=lambda item: item["start"],
    )
    position = blocks[0]["start"] if blocks else None
    for table in reversed(blocks):
        del lines[table["start"]:table["end"]]
    if not state.get("present"):
        while len(lines) > 1 and lines[-1].strip() == "" and lines[-2].strip() == "":
            lines.pop()
        return lines
    if isinstance(state.get("raw"), list):
        block = list(state["raw"])
    else:
        block = codex_render_tables(state["value"])
        if position is not None and position < len(lines) and lines[position].strip():
            block.append("")
    if position is None:
        while lines and lines[-1].strip() == "":
            lines.pop()
        if lines:
            lines.append("")
        lines.extend(block)
        lines.append("")
    else:
        lines[position:position] = block
    return lines


def codex_write_document(lines):
    return "\n".join(lines).encode("utf-8")


def codex_document_is_blank(lines):
    return all(not line.strip() for line in lines)


def codex_config_references_helper(config_path: str, helper_path: str) -> bool:
    """Does any provider's auth command in this config run the shared helper?

    Reads through the TOML parser so quoted keys ("command"), dotted keys
    (auth.command inside the provider table) and comments are handled the
    way Codex handles them. A config that cannot be read or parsed cannot
    prove the helper is unused, so it counts as a reference.
    """
    if not os.path.lexists(config_path):
        return False
    if not os.path.isfile(config_path):
        return True
    try:
        with open(config_path, encoding="utf-8") as handle:
            doc = parse_codex_toml(handle.read())
    except (OSError, UnicodeDecodeError, LifecycleError):
        return True
    target = os.path.realpath(helper_path)
    scopes = [((), doc["top"])] + [(table["parts"], table["entries"]) for table in doc["tables"]]
    for prefix, entries in scopes:
        for entry in entries.values():
            full = prefix + entry["parts"]
            if full[:1] != ("model_providers",):
                continue
            if not entry["ok"]:
                # An inline table anywhere under model_providers (a whole
                # provider, or just its auth) may name the helper and cannot
                # be opened by the line editor, so keep the dependency.
                return True
            if full[-2:] != ("auth", "command"):
                continue
            if not entry["ok"] or not isinstance(entry["value"], str):
                return True
            if os.path.realpath(os.path.expanduser(entry["value"])) == target:
                return True
    return False


def codex_home_dirs(config_path, codex_home):
    """Directories that are a Codex home, never a project's .codex folder."""
    homes = {os.path.dirname(config_path), codex_home}
    try:
        homes.add(os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".codex"))
    except KeyError:
        pass
    homes.add(os.path.join(os.path.expanduser("~"), ".codex"))
    if os.environ.get("CODEX_HOME"):
        homes.add(normalize_path(os.environ["CODEX_HOME"]))
    return {os.path.realpath(path) for path in homes}


def codex_project_configs(cwd, excluded_dirs):
    """Project .codex/config.toml files from the working directory up to the repo root.

    A user's own Codex home also holds a .codex/config.toml; walking up from
    the home directory would otherwise report the user config as a project
    layer, so Codex homes are skipped.
    """
    found = []
    current = cwd
    while True:
        candidate = os.path.join(current, ".codex", "config.toml")
        if os.path.isfile(candidate) and os.path.realpath(os.path.dirname(candidate)) not in excluded_dirs:
            found.append(candidate)
        if os.path.lexists(os.path.join(current, ".git")):
            break
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return found


def codex_overrides_in(path, label, protected_keys):
    """Keys in one higher-precedence Codex config that would override Arena's."""
    try:
        doc = load_codex_document(path, "Codex config")
    except LifecycleError as exc:
        return [f"{label} {path}: {exc}"]
    keys = [key for key in protected_keys if (key,) in doc["top"]]
    if any(table["parts"] == ("model_providers", CODEX_PROVIDER_ID) for table in doc["tables"]):
        keys.append(CODEX_PROVIDER_TABLE)
    return [f"{label} {path}: {', '.join(keys)}"] if keys else []


def codex_active_profile_problems(doc, active, config_path, protected_keys):
    """What the active profile sets, across every TOML spelling of a profile.

    [profiles.work] tables, [profiles] with work.model = ..., dotted
    profiles.work.model = ... at top level, and inline tables at any of those
    levels all mean the same thing to Codex. Inline tables are opaque to the
    line editor, so they are reported as unverifiable rather than ignored.
    """
    prefix = ("profiles", active)
    scopes = [((), doc["top"])] + [(table["parts"], table["entries"]) for table in doc["tables"]]
    settings = []
    opaque = False
    for scope_prefix, entries in scopes:
        for entry in entries.values():
            full = scope_prefix + entry["parts"]
            if full[:1] != ("profiles",):
                continue
            if full == ("profiles",) and not entry["ok"]:
                opaque = True
            elif full[:2] == prefix:
                rest = full[2:]
                if rest == () and not entry["ok"]:
                    opaque = True
                elif len(rest) == 1 and rest[0] in protected_keys:
                    settings.append(rest[0])
    problems = []
    if settings:
        problems.append(f"profile {config_path}: profiles.{active} sets {', '.join(dict.fromkeys(settings))}")
    if opaque:
        problems.append(
            f"profile {config_path}: profile \"{active}\" is active but is defined with an inline table "
            "the installer cannot read; check it does not set model or model_provider"
        )
    return problems


def codex_precedence(args):
    """Report Codex config layers that outrank the user config the installer writes.

    Codex resolves, highest first: CLI flags, trusted-project .codex/config.toml,
    the active profile, the user config.toml, then system and managed files.
    Flags cannot be checked; the rest are.
    """
    cwd, config_path, codex_home = map(normalize_path, args)
    problems = []
    protected_keys = ("model", "model_provider")
    if any(row["id"] not in ROUTER_MODEL_IDS for row in enabled_models("")):
        protected_keys += ("model_reasoning_effort", "model_context_window")
    for path in codex_project_configs(cwd, codex_home_dirs(config_path, codex_home)):
        problems.extend(codex_overrides_in(path, "project", protected_keys))
    try:
        user = load_codex_document(config_path, "Codex config", missing_ok=True)
    except LifecycleError as exc:
        # Install reports the same failure with the full remedy.
        user = None
    if user is not None:
        profile = user["top"].get(("profile",))
        if profile is not None and not (profile["ok"] and isinstance(profile["value"], str)):
            problems.append(
                f"profile {config_path}: profile is set in a form the installer cannot read; "
                "check the active profile does not set model or model_provider"
            )
        if profile is not None and profile["ok"] and isinstance(profile["value"], str):
            active = profile["value"]
            problems.extend(codex_active_profile_problems(user, active, config_path, protected_keys))
            profile_file = os.path.join(codex_home, active + ".config.toml")
            if os.path.isfile(profile_file):
                problems.extend(codex_overrides_in(profile_file, "profile", protected_keys))
    for path in ("/etc/codex/managed_config.toml",):
        if os.path.isfile(path):
            problems.extend(codex_overrides_in(path, "managed", protected_keys))
    print("\n".join(problems))


def install_codex(args, *, check_only=False):
    (
        requested_path,
        state_path,
        journal_path,
        arena_dir,
        token_path,
        helper_path,
        base_url,
        model,
        staged_token,
        allow_conflicts_raw,
    ) = args
    requested_path = normalize_path(requested_path)
    state_path = normalize_path(state_path)
    journal_path = normalize_path(journal_path)
    arena_dir = normalize_path(arena_dir)
    token_path = normalize_path(token_path)
    helper_path = normalize_path(helper_path)
    allow_conflicts = allow_conflicts_raw == "1"

    recover_pending(journal_path)
    catalog_path = codex_catalog_path(arena_dir)
    updates = codex_updates(base_url, helper_path, model, catalog_path)
    receipt = load_receipt(state_path) if os.path.exists(state_path) else None
    if receipt is not None:
        # Receipts written by the Claude or OpenCode arm predate the catalog
        # entry, or recorded it as absent long before Codex joined. Until
        # Arena has installed the catalog, its baseline is whatever is on disk
        # now, so a file the user created in between is restored, not deleted.
        files = receipt.setdefault("files", {})
        if files.get("codex_catalog", {}).get("installed") is None:
            files["codex_catalog"] = codex_catalog_entry(arena_dir)
    section = receipt.get("codex") if receipt else None
    preserved_defaults = set()
    changed = shared_file_conflicts(receipt, "codex") if receipt else []
    if isinstance(section, dict):
        logical_path = normalize_path(section["logical_path"])
        resolved_path = normalize_path(section["resolved_path"])
        if logical_path != requested_path:
            raise LifecycleError(
                f"Codex is already configured at {logical_path}; uninstall it before configuring {requested_path}"
            )
        validate_settings_topology(section, "Codex config")
        current = load_codex_document(resolved_path, "Codex config", missing_ok=True)
        preserved_defaults = (
            {"model", "model_provider", "model_context_window", "model_reasoning_effort"}
            if codex_leaf_state(current, "model_provider").get("value") != "arena" else set()
        )
        updates = [update for update in updates if update["name"] not in preserved_defaults]
        changed.extend(
            owned["name"]
            for owned in section["managed"]
            if owned["name"] not in preserved_defaults
            and not codex_state_equal(codex_leaf_state(current, owned["name"]), owned.get("installed"))
        )
        installed_mode = section.get("installed_mode")
        if os.path.isfile(resolved_path) and installed_mode is not None and file_mode(resolved_path) != installed_mode:
            changed.append("Codex config mode")
    else:
        logical_path = requested_path
        resolved_path = resolved_settings_path(logical_path)
        current = load_codex_document(resolved_path, "Codex config", missing_ok=True)
        section = {
            "logical_path": logical_path,
            "resolved_path": resolved_path,
            "settings_before": settings_metadata(logical_path, resolved_path),
            "installed_mode": None,
            "managed": [
                {
                    "path": update["path"],
                    "name": update["name"],
                    "before": codex_leaf_state(current, update["name"]),
                    "installed": codex_update_state(update),
                }
                for update in updates
            ],
        }
    if changed and not allow_conflicts:
        raise InstallConflict(changed)
    if receipt is None:
        receipt = make_shared_receipt(state_path, arena_dir, token_path, helper_path)
    receipt["codex"] = section
    directories = receipt.setdefault("directories", {})
    for key, path in (
        ("codex_logical_parent", os.path.dirname(logical_path)),
        ("codex_resolved_parent", os.path.dirname(resolved_path)),
    ):
        if key not in directories:
            snap = snapshot_path(path)
            directories[key] = {
                "path": path,
                "existed": snap["kind"] == "directory",
                "mode": snap.get("mode"),
            }

    staged_bytes = read_staged_token(staged_token, token_path)
    helper_content = helper_script_bytes(token_path)
    catalog_content = codex_catalog_bytes(model)
    snapshots = capture_paths(
        [
            arena_dir,
            os.path.dirname(logical_path),
            os.path.dirname(resolved_path),
            token_path,
            helper_path,
            catalog_path,
            logical_path,
            resolved_path,
            state_path,
        ]
    )
    if check_only:
        return
    try:
        write_journal(journal_path, "install", snapshots)
        maybe_fail("codex-after-journal")
        prepare_directory(journal_path, os.path.dirname(logical_path))
        prepare_directory(journal_path, os.path.dirname(resolved_path))
        place_token(journal_path, token_path, staged_bytes)
        maybe_fail("codex-after-token")
        record_applied(journal_path, helper_path, bytes_snapshot(helper_content, 0o700))
        atomic_bytes(helper_path, helper_content, 0o700)
        record_applied(journal_path, catalog_path, bytes_snapshot(catalog_content, 0o600))
        atomic_bytes(catalog_path, catalog_content, 0o600)
        maybe_fail("codex-after-helper")

        lines = list(current["lines"])
        # Per-model catalog windows replace the old global override. Retain
        # ownership of the removed scalar so uninstall restores its baseline.
        context_owned = next((item for item in section["managed"] if item["name"] == "model_context_window"), None)
        if context_owned is not None and "model_context_window" not in preserved_defaults:
            lines = codex_apply(parse_codex_toml("\n".join(lines)), "model_context_window", {"present": False})
            context_owned["installed"] = {"present": False}
        for update in updates:
            doc = parse_codex_toml("\n".join(lines))
            lines = codex_apply(doc, update["name"], codex_update_state(update))
        merged_bytes = codex_write_document(lines)
        target_mode = file_mode(resolved_path) if os.path.isfile(resolved_path) else 0o600
        record_applied(journal_path, resolved_path, bytes_snapshot(merged_bytes, target_mode))
        atomic_bytes(resolved_path, merged_bytes, target_mode)
        written = load_codex_document(resolved_path, "installed Codex config")
        for update in updates:
            if not codex_state_equal(
                codex_leaf_state(written, update["name"]),
                codex_update_state(update),
            ):
                raise LifecycleError(
                    f"post-write verification failed for Codex setting {update['name']}"
                )
        maybe_fail("codex-after-settings")

        installed_by_name = {item["name"]: item for item in section["managed"]}
        for update in updates:
            installed = codex_update_state(update)
            if update["name"] in installed_by_name:
                installed_by_name[update["name"]]["installed"] = installed
                installed_by_name[update["name"]]["path"] = update["path"]
            else:
                section["managed"].append(
                    {
                        "path": update["path"],
                        "name": update["name"],
                        "before": codex_leaf_state(current, update["name"]),
                        "installed": installed,
                    }
                )
        section["installed_mode"] = file_mode(resolved_path)
        receipt["files"]["token"]["installed"] = receipt_snapshot(token_path)
        receipt["files"]["helper"]["installed"] = receipt_snapshot(helper_path)
        receipt["files"]["codex_catalog"]["installed"] = receipt_snapshot(catalog_path)
        section["models"] = model_receipt(model)
        receipt["updated_at"] = utc_now()
        record_applied(journal_path, state_path, bytes_snapshot(json_bytes(receipt), 0o600))
        atomic_json(state_path, receipt, 0o600)
        maybe_fail("codex-after-state")

        os.unlink(journal_path)
        print(logical_path)
    except BaseException:
        rollback(journal_path)
        raise


def uninstall_codex(args):
    state_path, journal_path = map(normalize_path, args)
    recover_pending(journal_path)
    if not os.path.exists(state_path):
        return 4
    receipt = load_receipt(state_path)
    section = receipt.get("codex")
    if not isinstance(section, dict):
        return 4
    keep_shared = other_sections_remain(receipt, "codex")
    logical_path = normalize_path(section["logical_path"])
    resolved_path = normalize_path(section["resolved_path"])
    before_meta = section.get("settings_before", {})

    settings_path_conflict = (
        (not before_meta.get("logical_was_symlink") and os.path.islink(logical_path))
        or os.path.islink(resolved_path)
        or os.path.realpath(resolved_path) != resolved_path
        or not os.path.isfile(resolved_path)
    )
    current = (
        parse_codex_toml("")
        if settings_path_conflict
        else load_codex_document(resolved_path, "Codex config", missing_ok=True)
    )

    catalog = receipt.get("files", {}).get("codex_catalog")
    path_list = [state_path, logical_path, resolved_path]
    if catalog is not None:
        path_list.append(catalog["path"])
    if not keep_shared:
        for entry in receipt.get("files", {}).values():
            path_list.append(entry["path"])
    for entry in section_directories(receipt, "codex", keep_shared).values():
        path_list.append(entry["path"])
    snapshots = capture_paths(path_list)
    conflicts = []
    try:
        write_journal(journal_path, "uninstall", snapshots)
        maybe_fail("codex-uninstall-after-journal")
        if catalog is not None and catalog.get("installed") is not None:
            # Only Codex reads the catalog, so it is restored with this
            # section whether or not other tools remain. Clearing the installed
            # snapshot keeps the shared-file pass from reporting it again.
            before = len(conflicts)
            restore_owned_file(catalog, "Codex model catalog", conflicts, journal_path)
            if len(conflicts) == before:
                catalog["installed"] = None
        if settings_path_conflict:
            conflicts.append("Codex config path")
        else:
            lines = list(current["lines"])
            for owned in section["managed"]:
                doc = parse_codex_toml("\n".join(lines))
                if codex_state_equal(codex_leaf_state(doc, owned["name"]), owned.get("installed")):
                    lines = codex_apply(doc, owned["name"], owned["before"])
                else:
                    conflicts.append(owned["name"])
            if not before_meta.get("existed") and codex_document_is_blank(lines):
                record_applied(journal_path, resolved_path, {"kind": "absent"})
                remove_non_directory(resolved_path)
            else:
                current_mode = file_mode(resolved_path)
                installed_mode = section.get("installed_mode")
                if before_meta.get("existed") and current_mode == installed_mode:
                    desired_mode = before_meta.get("mode") or 0o600
                else:
                    desired_mode = current_mode
                    if installed_mode is not None and current_mode != installed_mode:
                        conflicts.append("Codex config mode")
                restored_bytes = codex_write_document(lines)
                record_applied(journal_path, resolved_path, bytes_snapshot(restored_bytes, desired_mode))
                atomic_bytes(resolved_path, restored_bytes, desired_mode)
        maybe_fail("codex-uninstall-after-settings")

        helper = receipt["files"]["helper"]
        config_paths = dict.fromkeys(helper.get("codex_configs", []) + [logical_path, resolved_path])
        references = [
            path for path in config_paths if codex_config_references_helper(path, helper["path"])
        ]
        token = receipt["files"]["token"]
        if references:
            # Keep this dependency after releasing the Codex section, so
            # uninstalling Claude later also preserves a still-needed helper.
            # The helper only prints the token, so the token stays with it.
            helper["codex_configs"] = references
            token["codex_configs"] = references
            conflicts.append("helper referenced by Codex")
            conflicts.append("token referenced by Codex")
        else:
            helper.pop("codex_configs", None)
            token.pop("codex_configs", None)

        if not keep_shared:
            restore_shared_files(receipt, conflicts, journal_path)
        maybe_fail("codex-uninstall-after-files")

        release_section(receipt, "codex", state_path, journal_path)
        maybe_fail("codex-uninstall-after-state")
        os.unlink(journal_path)

        directory_entries = sorted(
            section_directories(receipt, "codex", keep_shared).values(),
            key=lambda item: normalize_path(item["path"]).count(os.sep),
            reverse=True,
        )
        for entry in directory_entries:
            path = normalize_path(entry["path"])
            if not entry.get("existed") and os.path.isdir(path) and not os.path.islink(path):
                try:
                    os.rmdir(path)
                except OSError:
                    pass

        for name in dict.fromkeys(conflicts):
            print(f"PRESERVED {name}")
        return 0
    except BaseException:
        rollback(journal_path)
        raise


def sync_models(args: list[str], *, check_only: bool = False) -> None:
    name, state_path, journal_path, model, allow_conflicts = args
    recover_pending(journal_path)
    receipt = load_receipt(state_path)
    section = receipt[name]
    validate_settings_topology(section, name + " config")
    path = section["resolved_path"]
    owned = {item["name"]: item for item in section["managed"]}
    conflicts = []
    catalog_path = codex_catalog_path(os.path.dirname(state_path))
    if name == "codex":
        current = load_codex_document(path, "Codex config")
        changes = {}
        if (codex_leaf_state(current, "model_provider").get("value") == "arena"
                and codex_leaf_state(current, "model").get("value") not in {row["id"] for row in enabled_models(model)}):
            changes["model"] = {"present": True, "value": model}
        if codex_leaf_state(current, "model_provider").get("value") == "arena" and "model_context_window" in owned:
            changes["model_context_window"] = {"present": False}
        if (codex_leaf_state(current, "model_provider").get("value") == "arena"
                and any(row["id"] not in ROUTER_MODEL_IDS for row in enabled_models(model))):
            for key in ("model_context_window", "model_reasoning_effort"):
                before = codex_leaf_state(current, key)
                if key not in owned:
                    owned[key] = {"name": key, "path": [key], "before": before, "installed": before}
                    section["managed"].append(owned[key])
                changes[key] = {"present": False}
        for key in changes:
            if not codex_state_equal(codex_leaf_state(current, key), owned[key]["installed"]):
                conflicts.append(key)
        catalog = receipt["files"]["codex_catalog"]
        if not snapshot_equivalent(receipt_snapshot(catalog["path"]), catalog["installed"]):
            conflicts.append("codex_catalog")
        lines = list(current["lines"])
        # Upgrade only the recorded label; preserve custom names and the
        # rest of the provider tables, including their uninstall baseline.
        prior = owned[CODEX_PROVIDER_TABLE]["installed"]["value"][CODEX_PROVIDER_TABLE]
        for table in current["tables"]:
            if table["parts"] == ("model_providers", CODEX_PROVIDER_ID):
                label = table["entries"].get(("name",))
                if (label and codex_entry_value(label) == prior.get("name")
                        and prior.get("name") != CODEX_PROVIDER_NAME):
                    lines[label["line"]:label["end"] + 1] = ["name = " + toml_dump_scalar(CODEX_PROVIDER_NAME)]
                    prior["name"] = CODEX_PROVIDER_NAME
        for key, value in changes.items():
            lines = codex_apply(parse_codex_toml("\n".join(lines)), key, value)
            owned[key]["installed"] = value
        content = codex_write_document(lines)
    else:
        current = load_json_object(path, name + " config", jsonc=name == "opencode")
        merged = copy.deepcopy(current)
        if name == "claude":
            key = "CLAUDE_CODE_MODEL_CAPABILITIES"
            prior = owned.get(key)
            if prior:
                migrate_capabilities(current, prior)
                before = leaf_state(current, CAPABILITIES_PATH)
                if "capability_lock" in prior and (
                    capability_restore(before, prior) is None
                    or any(capability_effort(before.get("value", ""), selector) is not False
                           for selector in capability_locks(prior))
                ):
                    conflicts.append(key)
            selectors = claude_effort_locks(model)
            value = claude_capabilities(current, prior, selectors)
            if prior is None:
                prior = {"name": key, "path": CAPABILITIES_PATH.copy(),
                         "before": leaf_state(current, CAPABILITIES_PATH)}
                section["managed"].append(prior)
            prior["installed"] = {"present": True, "value": value}
            prior["capability_lock"] = (selectors[0] if selectors else "")
            prior["capability_locks"] = selectors
            set_leaf(merged, CAPABILITIES_PATH, prior["installed"])
            key, field, value = "modelPicker", ["modelPicker"], claude_model_picker(model)
            prior = owned.get(key)
            before = leaf_state(current, field)
            if prior and before != prior["installed"]:
                conflicts.append(key)
            set_leaf(merged, field, {"present": True, "value": value})
            if prior is None:
                prior = {"name": key, "path": field, "before": before}
                section["managed"].append(prior)
            prior["installed"] = {"present": True, "value": value}
            enabled = {row["id"] for row in enabled_models(model)}
            for key in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL"):
                prior = owned[key]
                before = leaf_state(current, prior["path"])
                if before.get("value") not in enabled:
                    if before != prior["installed"]:
                        conflicts.append(key)
                    installed = {"present": True, "value": model}
                    set_leaf(merged, prior["path"], installed)
                    prior["installed"] = installed
        else:
            prior = owned["provider.arena"]
            field = ["provider", "arena", "models"]
            if leaf_state(current, field) != leaf_state({"provider": {"arena": prior["installed"]["value"]}}, field):
                conflicts.append("provider.arena.models")
            value = opencode_models(model)
            set_leaf(merged, field, {"present": True, "value": value})
            prior["installed"]["value"]["models"] = value
            # Migrate the installer's provider label without replacing a
            # user's custom label, and retain the original uninstall baseline.
            label_field = ["provider", "arena", "name"]
            if leaf_state(current, label_field) == leaf_state({"provider": {"arena": prior["installed"]["value"]}}, label_field):
                set_leaf(merged, label_field, {"present": True, "value": OPENCODE_PROVIDER_NAME})
                prior["installed"]["value"]["name"] = OPENCODE_PROVIDER_NAME
            for key in ("model", "small_model"):
                if isinstance(current.get(key), str) and not current[key].startswith("arena/"):
                    continue
                target = "arena/" + (enabled_models(model)[0]["id"] if key == "small_model" else model)
                if current.get(key) == target or (key == "model" and current.get(key) in {"arena/" + model_id for model_id in value}):
                    continue
                if leaf_state(current, [key]) != owned[key]["installed"]:
                    conflicts.append(key)
                installed = {"present": True, "value": target}
                set_leaf(merged, [key], installed)
                owned[key]["installed"] = installed
        content = (json.dumps(merged, indent=2) + "\n").encode()
    if conflicts and allow_conflicts != "1":
        raise InstallConflict(conflicts)
    if check_only:
        return
    paths = [path, state_path] + ([catalog_path] if name == "codex" else [])
    snapshots = capture_paths(paths)
    try:
        write_journal(journal_path, "install", snapshots)
        mode = file_mode(path)
        record_applied(journal_path, path, bytes_snapshot(content, mode))
        atomic_bytes(path, content, mode)
        if name == "codex":
            catalog_content = codex_catalog_bytes(model)
            record_applied(journal_path, catalog_path, bytes_snapshot(catalog_content, 0o600))
            atomic_bytes(catalog_path, catalog_content, 0o600)
            receipt["files"]["codex_catalog"]["installed"] = receipt_snapshot(catalog_path)
        section["models"] = model_receipt(model)
        receipt["updated_at"] = utc_now()
        record_applied(journal_path, state_path, bytes_snapshot(json_bytes(receipt), 0o600))
        atomic_json(state_path, receipt, 0o600)
        os.unlink(journal_path)
        print(section["logical_path"])
    except BaseException:
        rollback(journal_path)
        raise


def status(args):
    """Print which harness sections the receipt holds, as JSON, for the menu."""
    (state_path,) = map(normalize_path, args)
    if not os.path.exists(state_path):
        print("{}")
        return 0
    receipt = load_receipt(state_path)
    report = {}
    for name in HARNESS_SECTIONS:
        section = receipt.get(name)
        if isinstance(section, dict):
            report[name] = {"path": section.get("logical_path")}
            owned = {item["name"]: item["installed"].get("value") for item in section["managed"]}
            if name == "claude":
                base_url = owned["ANTHROPIC_BASE_URL"]
            elif name == "opencode":
                base_url = owned["provider.arena"]["options"]["baseURL"]
            else:
                base_url = owned[CODEX_PROVIDER_TABLE][CODEX_PROVIDER_TABLE]["base_url"]
            if name != "claude" and base_url.endswith("/v1"):
                base_url = base_url[:-3]
            report[name]["base_url"] = base_url
    token = receipt.get("files", {}).get("token", {})
    if token.get("installed") is not None:
        report["token"] = {"path": token.get("path")}
    print(json.dumps(report, sort_keys=True))
    return 0


def main():
    if len(sys.argv) < 2:
        raise LifecycleError("missing lifecycle action")
    action = sys.argv[1]
    if action == "opencode-precedence":
        if len(sys.argv) != 4:
            raise LifecycleError("invalid OpenCode precedence arguments")
        opencode_precedence(sys.argv[2:])
        return 0
    if action == "codex-precedence":
        if len(sys.argv) != 5:
            raise LifecycleError("invalid Codex precedence arguments")
        codex_precedence(sys.argv[2:])
        return 0
    if action == "model-notices":
        model = sys.argv[2]
        models = enabled_models(model, announce=True)
        if capability_selector(model) not in {row["id"] for row in models}:
            if os.environ.get("ARENA_DEFAULT_MODEL"):
                raise LifecycleError("the requested default model is unavailable to this key")
            model = models[0]["id"]
        model = capability_selector(model)
        print(model)
        return 0
    if action in ("sync", "check-sync"):
        journal_path = normalize_path(sys.argv[4])
        operation = lambda: (sync_models(sys.argv[2:], check_only=action == "check-sync"), 0)[1]
    elif action == "install":
        if len(sys.argv) != 12:
            raise LifecycleError("invalid install lifecycle arguments")
        journal_path = normalize_path(sys.argv[4])
        operation = lambda: (install(sys.argv[2:]), 0)[1]
    elif action == "check-install":
        if len(sys.argv) != 13 or sys.argv[2] not in HARNESS_SECTIONS:
            raise LifecycleError("invalid install preflight arguments")
        journal_path = normalize_path(sys.argv[5])
        check = {"claude": install, "opencode": install_opencode, "codex": install_codex}[sys.argv[2]]
        operation = lambda: (check(sys.argv[3:], check_only=True), 0)[1]
    elif action == "uninstall":
        if len(sys.argv) != 4:
            raise LifecycleError("invalid uninstall lifecycle arguments")
        journal_path = normalize_path(sys.argv[3])
        operation = lambda: uninstall(sys.argv[2:])
    elif action == "install-opencode":
        if len(sys.argv) != 12:
            raise LifecycleError("invalid OpenCode install lifecycle arguments")
        journal_path = normalize_path(sys.argv[4])
        operation = lambda: (install_opencode(sys.argv[2:]), 0)[1]
    elif action == "uninstall-opencode":
        if len(sys.argv) != 4:
            raise LifecycleError("invalid OpenCode uninstall lifecycle arguments")
        journal_path = normalize_path(sys.argv[3])
        operation = lambda: uninstall_opencode(sys.argv[2:])
    elif action == "install-codex":
        if len(sys.argv) != 12:
            raise LifecycleError("invalid Codex install lifecycle arguments")
        journal_path = normalize_path(sys.argv[4])
        operation = lambda: (install_codex(sys.argv[2:]), 0)[1]
    elif action == "uninstall-codex":
        if len(sys.argv) != 4:
            raise LifecycleError("invalid Codex uninstall lifecycle arguments")
        journal_path = normalize_path(sys.argv[3])
        operation = lambda: uninstall_codex(sys.argv[2:])
    elif action == "status":
        if len(sys.argv) != 4:
            raise LifecycleError("invalid status lifecycle arguments")
        journal_path = normalize_path(sys.argv[3])
        operation = lambda: status(sys.argv[2:3])
    elif action == "recover":
        if len(sys.argv) != 3:
            raise LifecycleError("invalid recovery lifecycle arguments")
        journal_path = normalize_path(sys.argv[2])
        operation = lambda: (recover_pending(journal_path), 0)[1]
    else:
        raise LifecycleError(f"unknown lifecycle action: {action}")
    with lifecycle_lock(journal_path):
        return operation()


try:
    exit_code = main()
except InstallConflict as exc:
    sys.stderr.write(
        "arena setup: refusing to overwrite Arena-owned settings changed after installation:\n"
    )
    for name in exc.names:
        sys.stderr.write(f"  - {name}\n")
    sys.exit(3)
except LifecycleError as exc:
    sys.stderr.write(f"arena setup: {exc}\n")
    sys.exit(1)
except BaseException as exc:
    sys.stderr.write(f"arena setup: transaction failed: {exc}\n")
    sys.exit(1)
sys.exit(exit_code)
PYEOF
}

# ---------------------------------------------------------------------------
# Harnesses
# ---------------------------------------------------------------------------

# Every tool this script can configure, in menu order. Bash 3.2 (macOS) has
# no associative arrays, so parallel indexed arrays carry the per-tool state.
HARNESS_NAMES=(claude opencode codex)
HARNESS_LABELS=("Claude Code" "OpenCode" "Codex")
# 1 = selected for the current action; filled by choose_harnesses /
# choose_uninstall_targets.
HARNESS_SELECTED=(0 0 0)
# Human-readable detection note per tool ("claude on PATH", "not installed").
HARNESS_NOTES=("" "" "")
# Overwrite decisions collected before any selected tool writes its config.
HARNESS_ALLOW_CONFLICTS=(0 0 0)

harness_index() {
  local i
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    if [ "${HARNESS_NAMES[$i]}" = "$1" ]; then printf '%s' "$i"; return 0; fi
  done
  return 1
}

harness_selected() {
  local i
  i="$(harness_index "$1")" || return 1
  [ "${HARNESS_SELECTED[$i]}" = "1" ]
}

selected_harness_labels() {
  local i out=""
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    [ "${HARNESS_SELECTED[$i]}" = "1" ] || continue
    if [ -n "$out" ]; then out="$out and ${HARNESS_LABELS[$i]}"; else out="${HARNESS_LABELS[$i]}"; fi
  done
  printf '%s' "$out"
}

# Setup-only gate: rebuild the tool arrays without Codex when the served
# script carries CODEX_ENABLED=0. Uninstall keeps the full list so an existing
# Codex section can still be removed after the switch is turned off.
restrict_harnesses_for_setup() {
  [ "${CODEX_ENABLED:-1}" = "1" ] && return 0
  local i
  local -a keep_names=() keep_labels=()
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    [ "${HARNESS_NAMES[$i]}" = "codex" ] && continue
    keep_names+=("${HARNESS_NAMES[$i]}")
    keep_labels+=("${HARNESS_LABELS[$i]}")
  done
  HARNESS_NAMES=("${keep_names[@]}")
  HARNESS_LABELS=("${keep_labels[@]}")
  HARNESS_SELECTED=()
  HARNESS_NOTES=()
  HARNESS_ALLOW_CONFLICTS=()
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    HARNESS_SELECTED+=(0)
    HARNESS_NOTES+=("")
    HARNESS_ALLOW_CONFLICTS+=(0)
  done
}

# "Claude Code and OpenCode" or "Claude Code, OpenCode, and Codex".
all_harness_labels() {
  local n=${#HARNESS_LABELS[@]} i out=""
  if [ "$n" -le 2 ]; then
    for ((i = 0; i < n; i++)); do
      if [ -n "$out" ]; then out="$out and ${HARNESS_LABELS[$i]}"; else out="${HARNESS_LABELS[$i]}"; fi
    done
  else
    for ((i = 0; i < n; i++)); do
      if [ "$i" -eq $((n - 1)) ]; then out="$out, and ${HARNESS_LABELS[$i]}"
      elif [ -n "$out" ]; then out="$out, ${HARNESS_LABELS[$i]}"
      else out="${HARNESS_LABELS[$i]}"; fi
    done
  fi
  printf '%s' "$out"
}

harness_names_csv() {
  local IFS=,
  printf '%s' "${HARNESS_NAMES[*]}"
}

selected_harness_count() {
  local i count=0
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    [ "${HARNESS_SELECTED[$i]}" = "1" ] && count=$((count + 1))
  done
  printf '%s' "$count"
}

any_harness_selected() {
  local i
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    [ "${HARNESS_SELECTED[$i]}" = "1" ] && return 0
  done
  return 1
}

claude_settings_path() {
  printf '%s/settings.json' "$(expanduser "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")"
}

# OpenCode's global config: $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode,
# else ~/.config/opencode. Always the .json file; an existing .jsonc sibling is
# left alone (OpenCode merges both, .jsonc winning on conflicts).
opencode_config_path() {
  local dir
  if [ -n "${OPENCODE_CONFIG_DIR:-}" ]; then
    dir="$(expanduser "$OPENCODE_CONFIG_DIR")"
  else
    dir="$(expanduser "${XDG_CONFIG_HOME:-$HOME/.config}")/opencode"
  fi
  printf '%s/opencode.json' "$dir"
}

# Codex keeps everything under $CODEX_HOME, default ~/.codex. The CLI, the IDE
# extension, and the desktop app all read the same config.toml.
codex_home_dir() {
  expanduser "${CODEX_HOME:-$HOME/.codex}"
}

codex_config_path() {
  printf '%s/config.toml' "$(codex_home_dir)"
}

harness_config_path() {
  case "$1" in
    claude) claude_settings_path ;;
    opencode) opencode_config_path ;;
    codex) codex_config_path ;;
  esac
}

# Detection is by binary on PATH or by an existing config directory. No tool
# is executed: `claude --version`, `opencode --version`, and `codex --version`
# can block on first-run work, and the config is written the same way either way.
detect_harnesses() {
  local i name path
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    name="${HARNESS_NAMES[$i]}"
    path="$(harness_config_path "$name")"
    if command -v "$name" >/dev/null 2>&1; then
      HARNESS_NOTES[$i]="$name on PATH · $(detilde "$path")"
      HARNESS_SELECTED[$i]=1
    elif [ -d "$(dirname "$path")" ]; then
      HARNESS_NOTES[$i]="config dir exists · $(detilde "$path")"
      HARNESS_SELECTED[$i]=1
    else
      HARNESS_NOTES[$i]="not installed"
      HARNESS_SELECTED[$i]=0
    fi
  done
}

# ARENA_SETUP_HARNESSES=claude,opencode overrides detection (setup) or the
# receipt (uninstall). Unknown names fail so a typo cannot silently skip a tool.
apply_harness_override() {
  local raw="$1" item i found
  [ -n "$raw" ] || return 1
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do HARNESS_SELECTED[$i]=0; done
  IFS=',' read -r -a __items <<<"$raw"
  for item in "${__items[@]}"; do
    item="$(printf '%s' "$item" | tr -d '[:space:]')"
    [ -n "$item" ] || continue
    found=0
    for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
      if [ "${HARNESS_NAMES[$i]}" = "$item" ]; then HARNESS_SELECTED[$i]=1; found=1; fi
    done
    if [ "$found" -ne 1 ]; then
      fail "ARENA_SETUP_HARNESSES names an unknown tool '$item' (known: ${HARNESS_NAMES[*]})"
      return 2
    fi
  done
  return 0
}

print_harness_list() {
  local i mark
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    if [ "${HARNESS_SELECTED[$i]}" = "1" ]; then mark="$(green "[x]")"; else mark="[ ]"; fi
    printf '  %s %s) %-12s %s\n' "$mark" "$((i + 1))" "${HARNESS_LABELS[$i]}" "${HARNESS_NOTES[$i]}"
  done
}

# Interactive multi-select on a TTY: ↑/↓ (or j/k) move between tools and
# Continue. Space/Enter toggle a tool; Enter on Continue confirms the list.
# Digits still toggle the corresponding tool directly.
# Unattended runs (ARENA_SETUP_NONINTERACTIVE=1 or no TTY) take the list as
# is, so scripted callers set ARENA_SETUP_HARNESSES instead of answering.
HARNESS_PICKER_INTERACTIVE=0
pick_harnesses() {
  local question="$1"
  HARNESS_PICKER_INTERACTIVE=0
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" = "1" ] || [ ! -t 0 ]; then
    print_harness_list
    any_harness_selected || { fail "no tool selected; set ARENA_SETUP_HARNESSES=$(harness_names_csv)"; return 1; }
    return 0
  fi

  # No cursor hiding and no INT trap here: bash 3.2's read -n does not run a
  # trapped SIGINT handler until the next keypress, which made Ctrl-C look
  # stuck. With the default disposition Ctrl-C ends the script at once and
  # leaves the terminal as it was.
  local cur=0 i n choices key rest pointer mark continuation continuation_style hint
  n=${#HARNESS_NAMES[@]}
  choices=$((n + 1))
  for ((i = 0; i < n; i++)); do
    if [ "${HARNESS_SELECTED[$i]}" = "1" ]; then cur=$i; break; fi
  done
  printf '%s\n' "$question" >&2
  while true; do
    for ((i = 0; i < n; i++)); do
      if [ "$i" -eq "$cur" ]; then pointer="$(bold "❯")"; else pointer=" "; fi
      if [ "${HARNESS_SELECTED[$i]}" = "1" ]; then mark="$(green "[x]")"; else mark="[ ]"; fi
      printf '  %s %s %-12s %s\033[K\n' "$pointer" "$mark" "${HARNESS_LABELS[$i]}" "$(detilde "${HARNESS_NOTES[$i]}")" >&2
    done
    printf '\033[K\n' >&2
    if [ "$cur" -eq "$n" ]; then pointer="$(bold "❯")"; else pointer=" "; fi
    if any_harness_selected; then
      continuation="Continue with $(selected_harness_labels) →"
      if [ "$cur" -eq "$n" ]; then
        continuation_style=$'\033[1;7m'
      else
        continuation_style=$'\033[1m'
      fi
    else
      continuation="Continue (select at least one tool)"
      continuation_style=$'\033[2m'
    fi
    printf '  %s%s %s \033[0m\033[K\n' "$pointer" "$continuation_style" "$continuation" >&2
    printf '\033[K\n' >&2
    if [ "$cur" -lt "$n" ]; then
      hint="↑/↓ move · space/enter toggle · esc cancel"
    elif any_harness_selected; then
      hint="enter continue · ↑/↓ change tools · esc cancel"
    else
      hint="↑/↓ choose a tool · esc cancel"
    fi
    printf '  \033[2m%s\033[0m\033[K\n' "$hint" >&2
    # EOF (Ctrl-D, closed stdin) cancels rather than confirming.
    IFS= read -rsn1 key || { printf '\n' >&2; fail "nothing changed"; return 1; }
    case "$key" in
      $'\x1b')
        rest=""
        IFS= read -rsn2 -t "$(escape_wait)" rest || rest=""
        case "$rest" in
          "[A"|"OA") cur=$(((cur - 1 + choices) % choices)) ;;
          "[B"|"OB") cur=$(((cur + 1) % choices)) ;;
          *) printf '\n' >&2; fail "nothing changed"; return 1 ;;   # Esc alone, or Esc then anything
        esac
        ;;
      q|Q|$'\x04') printf '\n' >&2; fail "nothing changed"; return 1 ;;   # q or Ctrl-D
      k) cur=$(((cur - 1 + choices) % choices)) ;;
      j) cur=$(((cur + 1) % choices)) ;;
      ""|" ")
        if [ "$cur" -lt "$n" ]; then
          if [ "${HARNESS_SELECTED[$cur]}" = "1" ]; then HARNESS_SELECTED[$cur]=0; else HARNESS_SELECTED[$cur]=1; fi
        elif [ -z "$key" ] && any_harness_selected; then
          break
        fi
        ;;
      [1-9])
        if [ "$key" -le "$n" ]; then
          if [ "${HARNESS_SELECTED[$((key - 1))]}" = "1" ]; then
            HARNESS_SELECTED[$((key - 1))]=0
          else
            HARNESS_SELECTED[$((key - 1))]=1
          fi
        fi
        ;;
    esac
    printf '\033[%dA' "$((n + 4))" >&2
  done
  HARNESS_PICKER_INTERACTIVE=1
  return 0
}

# Setup: detect, apply any override, default to Claude Code when nothing is
# found (today's behaviour for a machine that will install the tool later).
choose_harnesses() {
  local rc
  detect_harnesses
  info "Found on this machine:"
  if [ -n "${ARENA_SETUP_HARNESSES:-}" ]; then
    apply_harness_override "$ARENA_SETUP_HARNESSES"; rc=$?
    [ "$rc" -ne 2 ] || return 1
  elif ! any_harness_selected; then
    HARNESS_SELECTED[$(harness_index claude)]=1
    HARNESS_NOTES[$(harness_index claude)]="not installed · config will be written anyway"
  fi
  pick_harnesses "Configure the checked tools?"
}

# Uninstall: what the receipt owns, from the lifecycle's status action.
# Sets HARNESS_SELECTED from the receipt (or the override) and prints the list.
choose_uninstall_targets() {
  local status_json i name rc
  status_json="$(claude_lifecycle status "$STATE_FILE" "$TRANSACTION_FILE")" || {
    fail "could not read the Arena install receipt"
    return 1
  }
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    name="${HARNESS_NAMES[$i]}"
    case "$status_json" in
      *"\"$name\""*)
        HARNESS_SELECTED[$i]=1
        HARNESS_NOTES[$i]="$(detilde "$(harness_config_path "$name")")"
        ;;
      *)
        HARNESS_SELECTED[$i]=0
        HARNESS_NOTES[$i]="not installed by Arena"
        ;;
    esac
  done
  if [ -n "${ARENA_SETUP_HARNESSES:-}" ]; then
    local -a owned=("${HARNESS_SELECTED[@]}")
    apply_harness_override "$ARENA_SETUP_HARNESSES"; rc=$?
    [ "$rc" -ne 2 ] || return 1
    for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
      # Only tools the receipt owns can be uninstalled.
      [ "${owned[$i]}" = "1" ] || HARNESS_SELECTED[$i]=0
    done
  fi
  info "Installed by Arena on this machine:"
  pick_harnesses "Remove the checked tools?"
}

all_owned_harnesses_selected() {
  # True when every tool the receipt owns is selected, i.e. the token goes too.
  local status_json i name
  status_json="$(claude_lifecycle status "$STATE_FILE" "$TRANSACTION_FILE" 2>/dev/null)" || return 1
  for ((i = 0; i < ${#HARNESS_NAMES[@]}; i++)); do
    name="${HARNESS_NAMES[$i]}"
    case "$status_json" in
      *"\"$name\""*) [ "${HARNESS_SELECTED[$i]}" = "1" ] || return 1 ;;
    esac
  done
  return 0
}

running_opencode_sessions() {
  if [ -n "${ARENA_SETUP_TEST_RUNNING_OPENCODE_SESSIONS:-}" ]; then
    printf '%s' "$ARENA_SETUP_TEST_RUNNING_OPENCODE_SESSIONS"
    return
  fi
  pgrep -x opencode 2>/dev/null | wc -l | tr -d ' '
}

note_live_opencode_sessions() {
  local live_sessions
  live_sessions="$(running_opencode_sessions)"
  case "$live_sessions" in
    ''|*[!0-9]*) live_sessions=0 ;;
  esac
  if [ "$live_sessions" -gt 0 ]; then
    warn "$live_sessions OpenCode process(es) look open right now. OpenCode reads its config when it starts, so restart them to pick up the change."
  else
    info "OpenCode reads its config at start; restart any OpenCode session that was already open."
  fi
}

# Codex CLI processes. The npm launcher execs a platform binary named
# codex-<target>, so match both spellings on the command line; the desktop
# app is a separate process name and is left to its own verification.
running_codex_sessions() {
  if [ -n "${ARENA_SETUP_TEST_RUNNING_CODEX_SESSIONS:-}" ]; then
    printf '%s' "$ARENA_SETUP_TEST_RUNNING_CODEX_SESSIONS"
    return
  fi
  pgrep -f '(^|/)codex(-[A-Za-z0-9_.-]+)?( |$)' 2>/dev/null | wc -l | tr -d ' '
}

note_live_codex_sessions() {
  local live_sessions
  live_sessions="$(running_codex_sessions)"
  case "$live_sessions" in
    ''|*[!0-9]*) live_sessions=0 ;;
  esac
  if [ "$live_sessions" -gt 0 ]; then
    warn "$live_sessions Codex process(es) look open right now. Codex reads config.toml when it starts, so restart them to pick up the change."
  else
    info "Codex reads config.toml at start; restart any Codex session that was already open."
  fi
}

restart_codex_server() {
  command -v codex >/dev/null 2>&1 || return 0
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" != "1" ] && [ -t 0 ]; then
    if [ "$(confirm "Restart Codex's background server now so the new models show?" y)" = "y" ]; then
      if codex app-server daemon restart >/dev/null 2>&1; then
        ok "Codex's background server restarted. Reopen Codex to see the new models."
        return 0
      fi
      warn "Could not restart Codex's background server."
    fi
  fi
  info "Run: codex app-server daemon restart, then reopen Codex to see the new models."
}

# Codex layers config with project .codex/config.toml, the active profile, and
# managed files above the user config this script writes. Report anything in
# those layers that would override Arena's model or provider.
check_codex_precedence() {
  local config_path conflicts rc
  config_path="$(codex_config_path)"
  conflicts="$(claude_lifecycle codex-precedence "$PWD" "$config_path" "$(codex_home_dir)")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "could not validate Codex configuration"
    return "$rc"
  fi
  [ -n "$conflicts" ] || return 0

  warn "Codex config in this context can override Arena:"
  while IFS= read -r line; do [ -n "$line" ] && printf '  - %s\n' "$(detilde "$line")" >&2; done <<<"$conflicts"
  if [ "${ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS:-}" = "1" ]; then
    warn "continuing because ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 0
  fi
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" = "1" ]; then
    fail "nothing changed; remove the overrides or set ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 1
  fi
  if [ "$(confirm "Install the Codex config anyway?" n)" != "y" ]; then
    fail "nothing changed"
    return 1
  fi
}

# Check model overrides and provider lists inherited across OpenCode's global,
# project, home, custom-directory, environment, and managed configurations.
check_opencode_precedence() {
  local config_path conflicts rc
  config_path="$(opencode_config_path)"
  conflicts="$(claude_lifecycle opencode-precedence "$PWD" "$config_path")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "could not validate OpenCode configuration"
    return "$rc"
  fi
  [ -n "$conflicts" ] || return 0

  warn "OpenCode config in this context can override Arena:"
  while IFS= read -r line; do [ -n "$line" ] && printf '  - %s\n' "$(detilde "$line")" >&2; done <<<"$conflicts"
  if [ "${ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS:-}" = "1" ]; then
    warn "continuing because ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 0
  fi
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" = "1" ]; then
    fail "nothing changed; remove the overrides or set ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 1
  fi
  if [ "$(confirm "Install the global OpenCode config anyway?" n)" != "y" ]; then
    fail "nothing changed"
    return 1
  fi
}

preflight_harness() {
  local name="$1" index config_path rc
  index="$(harness_index "$name")"
  config_path="$(harness_config_path "$name")"
  while true; do
    if [ "${SYNC_MODELS:-0}" = "1" ]; then
      claude_lifecycle check-sync "$name" "$STATE_FILE" "$TRANSACTION_FILE" "$default_model" "${HARNESS_ALLOW_CONFLICTS[$index]}"
    else
      claude_lifecycle check-install "$name" \
        "$config_path" "$STATE_FILE" "$TRANSACTION_FILE" "$ARENA_DIR" \
        "$TOKEN_FILE" "$CLAUDE_HELPER" "$base_url" "$default_model" \
        "$PENDING_TOKEN_FILE" "${HARNESS_ALLOW_CONFLICTS[$index]}"
    fi
    rc=$?
    [ "$rc" -ne 0 ] || return 0
    if [ "$rc" -eq 3 ] && [ "${ARENA_SETUP_NONINTERACTIVE:-}" != "1" ]; then
      if [ "$(confirm "Overwrite those Arena-owned values for ${HARNESS_LABELS[$index]} and keep the original uninstall baseline?" n)" = "y" ]; then
        HARNESS_ALLOW_CONFLICTS[$index]=1
        continue
      fi
    fi
    fail "${HARNESS_LABELS[$index]}: setup stopped before writing any tool; nothing changed"
    return "$rc"
  done
}

configure_harness() {
  local name="$1" index config_path action installed_path rc
  index="$(harness_index "$name")"
  config_path="$(harness_config_path "$name")"
  case "$name" in
    opencode) action=install-opencode ;;
    codex) action=install-codex ;;
    *) action=install ;;
  esac
  installed_path="$(claude_lifecycle "$action" \
      "$config_path" "$STATE_FILE" "$TRANSACTION_FILE" "$ARENA_DIR" \
      "$TOKEN_FILE" "$CLAUDE_HELPER" "$base_url" "$default_model" \
      "$PENDING_TOKEN_FILE" "${HARNESS_ALLOW_CONFLICTS[$index]}")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    if [ -f "$TRANSACTION_FILE" ]; then
      fail "$name: installation stopped with an unfinished transaction; run setup again to recover it"
    else
      fail "$name: installation failed; writes from this tool's attempt were rolled back"
    fi
    report_completed_setup
    return "$rc"
  fi
  if [ -n "$COMPLETED_SETUP_TOOLS" ]; then
    COMPLETED_SETUP_TOOLS="$COMPLETED_SETUP_TOOLS and ${HARNESS_LABELS[$index]}"
  else
    COMPLETED_SETUP_TOOLS="${HARNESS_LABELS[$index]}"
  fi
  ok "$name → $installed_path"
}

configure_opencode() { configure_harness opencode; }
configure_codex() { configure_harness codex; }

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

banner() {
  printf '\033[36m'
cat <<'EOF'
   _________       ___    ____  ______ _   _____
  [_________]     /   |  / __ \/ ____// | / /   |
  (_)_____(_)    / /| | / /_/ / __/  /  |/ / /| |
   | | | | |    / ___ |/ _, _/ /___ / /|  / ___ |
   |_|_|_|_|   /_/  |_/_/ |_/_____//_/ |_/_/  |_|
EOF
  printf '\033[0m'
}

do_setup() {
  restrict_harnesses_for_setup
  info "Route $(all_harness_labels) through the Arena Router. Existing settings are preserved for uninstall."

  if ! command -v curl >/dev/null 2>&1; then
    fail "curl is required to validate the Arena token"
    return 1
  fi

  set_runtime_config || return 1
  step "Tools"
  choose_harnesses || return 1

  if harness_selected claude; then
    if ! guard_host_managed_claude_setup; then
      return 1
    fi
    if ! guard_inherited_unix_socket_setup; then
      return 1
    fi
    if ! guard_live_claude_setup; then
      return 1
    fi
  fi
  claude_lifecycle recover "$TRANSACTION_FILE" || {
    fail "could not recover an interrupted Arena installer transaction"
    return 1
  }
  if harness_selected opencode; then
    check_opencode_precedence || return 1
  fi

  step "Token"
  prepare_model_list || return 1
  PENDING_TOKEN_FILE="-"
  if [ -f "$TOKEN_FILE" ]; then
    if [ "$(confirm "Found an existing token at $TOKEN_FILE — use it?" y)" = "y" ]; then
      if ! validate_stored_token; then
        if [ "${ARENA_SETUP_NONINTERACTIVE:-}" = "1" ]; then
          fail "replace the stored token, then retry"
          return 1
        fi
        stage_token || return 1
      fi
    else
      stage_token || return 1
    fi
  else
    stage_token || return 1
  fi
  finish_model_list || return 1
  if harness_selected claude; then
    check_claude_precedence || return 1
  fi
  if harness_selected codex; then
    check_codex_precedence || return 1
  fi

  # Parse and validate every selected config and collect overwrite decisions
  # before the first tool commits. Each tool still owns its own transaction.
  local name
  for name in "${HARNESS_NAMES[@]}"; do
    if harness_selected "$name"; then
      preflight_harness "$name" || { cleanup_staged_token; return 1; }
    fi
  done

  step "Config"
  info "Routing $(bold "$default_model") via $base_url"
  SETUP_WRITES_STARTED=1
  if harness_selected claude; then
    if ! command -v claude >/dev/null 2>&1; then
      warn "Claude Code isn't installed (no \`claude\` on PATH) — config written anyway."
    fi
    configure_claude || { cleanup_staged_token; return 1; }
    ok "Token stored privately at $TOKEN_FILE"
  fi
  if harness_selected opencode; then
    if ! command -v opencode >/dev/null 2>&1; then
      warn "OpenCode isn't installed (no \`opencode\` on PATH) — config written anyway."
    fi
    configure_opencode || { cleanup_staged_token; return 1; }
    if ! harness_selected claude; then
      ok "Token stored privately at $TOKEN_FILE"
    fi
  fi
  if harness_selected codex; then
    if ! command -v codex >/dev/null 2>&1; then
      warn "Codex isn't installed (no \`codex\` on PATH) — config written anyway."
    fi
    configure_codex || { cleanup_staged_token; return 1; }
    if ! harness_selected claude && ! harness_selected opencode; then
      ok "Token stored privately at $TOKEN_FILE"
    fi
  fi
  cleanup_staged_token
  trap - EXIT HUP INT TERM

  step "Done"
  if [ "$(selected_harness_count)" -gt 1 ]; then
    info "You're all set — $(selected_harness_labels) now point at the Arena Router."
  else
    info "You're all set — $(selected_harness_labels) now points at the Arena Router."
  fi
  local setup_url="${PORTAL_URL%/dashboard/keys}"
  setup_url="${setup_url%/}/setup.sh"
  info "When new models become available to your workspace, update your model list:"
  info "  curl -fsSL $setup_url | bash"
  info 'Choose "update models", then restart your tools.'
  info "(Undo anytime: curl -fsSL $setup_url | bash, then choose uninstall.)"
  if harness_selected claude; then
    info "Claude settings are user-wide, so new standalone terminal and IDE sessions use Arena."
    info "A host app that enables CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST controls its own routing and ignores these user settings."
    note_live_sessions_setup
  fi
  if harness_selected opencode; then
    info "OpenCode's /models lists your enabled models."
    note_live_opencode_sessions
  fi
  if harness_selected codex; then
    info "Codex's /model lists your enabled models."
    note_live_codex_sessions
    restart_codex_server
  fi
  local run_hint=""
  harness_selected claude && run_hint="claude"
  if harness_selected opencode; then
    if [ -n "$run_hint" ]; then run_hint="$run_hint   or   opencode"; else run_hint="opencode"; fi
  fi
  if harness_selected codex; then
    if [ -n "$run_hint" ]; then run_hint="$run_hint   or   codex"; else run_hint="codex"; fi
  fi
  printf '\n%s\n' "$(bold "🚀 Run: $run_hint")"
}

do_sync() {
  local status_json name index installed_path
  claude_lifecycle recover "$TRANSACTION_FILE" || return 1
  status_json="$(claude_lifecycle status "$STATE_FILE" "$TRANSACTION_FILE")" || return 1
  base_url="$(printf '%s' "$status_json" | python3 -c 'import json,sys; rows=json.load(sys.stdin); urls={row["base_url"] for row in rows.values() if "base_url" in row}; sys.exit(1) if len(urls)>1 else print(next(iter(urls), ""))')" || {
    fail "installed tools use different gateway environments; configure them separately before updating models"
    return 1
  }
  if [ -z "$base_url" ]; then info "No Arena tools installed. Choose setup first."; return 0; fi
  set_runtime_config "$base_url" || return 1
  SYNC_MODELS=1
  prepare_model_list || return 1
  validate_stored_token || return 1
  finish_model_list || return 1
  case "$status_json" in *'"claude"'*) check_claude_precedence || return 1 ;; esac
  case "$status_json" in *'"codex"'*) check_codex_precedence || return 1 ;; esac
  for name in "${HARNESS_NAMES[@]}"; do
    case "$status_json" in *"\"$name\""*) preflight_harness "$name" || return 1 ;; esac
  done
  for name in "${HARNESS_NAMES[@]}"; do
    case "$status_json" in
      *"\"$name\""*)
        index="$(harness_index "$name")"
        installed_path="$(claude_lifecycle sync "$name" "$STATE_FILE" "$TRANSACTION_FILE" "$default_model" "${HARNESS_ALLOW_CONFLICTS[$index]}")" || return 1
        ok "$name models → $installed_path"
        if [ "$name" = "codex" ]; then restart_codex_server; fi
        ;;
    esac
  done
  cleanup_staged_token
  info "Models updated. Restart your tools."
}

# Count running Claude Code processes so setup/uninstall can tell the user
# which open sessions this change will (or won't) affect. Config is
# snapshotted per process: running sessions keep their wiring, NEW processes
# (including subagents spawned inside running sessions) read the changed
# files, and a session that hits an auth failure re-reads them (ENT-1703).
running_claude_sessions() {
  if [ -n "${ARENA_SETUP_TEST_RUNNING_SESSIONS:-}" ]; then
    printf '%s' "$ARENA_SETUP_TEST_RUNNING_SESSIONS"
    return
  fi
  pgrep -x claude 2>/dev/null | wc -l | tr -d ' '
}

note_live_sessions_setup() {
  local live_sessions
  live_sessions="$(running_claude_sessions)"
  case "$live_sessions" in
    ''|*[!0-9]*) live_sessions=0 ;;
  esac
  if [ "$live_sessions" -gt 0 ]; then
    warn "$live_sessions Claude Code session(s) look open right now. They keep their previous connection until they restart or hit an authentication failure — and NEW subagents and tools inside them start using Arena immediately, so a session on another provider can suddenly see 'free_router_model_restricted' errors. Restart those sessions (or let them finish first)."
  else
    info "Restart any Claude session that was already open before this setup."
  fi
}

note_live_sessions_uninstall() {
  local live_sessions
  live_sessions="$(running_claude_sessions)"
  case "$live_sessions" in
    ''|*[!0-9]*) live_sessions=0 ;;
  esac
  if [ "$live_sessions" -gt 0 ]; then
    warn "$live_sessions Claude Code session(s) look open right now. Sessions that started (or re-authenticated) while Arena was installed may fail with 'invalid API key' or 'Not logged in — run /login' the next time they re-authenticate. Close and reopen them."
  else
    info "If a Claude Code session was open while Arena was installed, restart it before relying on it."
  fi
}

env_value_is_truthy() {
  case "${1:-}" in
    1|true|TRUE|True|yes|YES|Yes|on|ON|On) return 0 ;;
    *) return 1 ;;
  esac
}

# A host-managed Claude process intentionally ignores provider, endpoint, and
# authentication values from settings files. User-wide setup cannot override
# that contract, so fail before accepting a token or changing configuration.
guard_host_managed_claude_setup() {
  if env_value_is_truthy "${CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST:-}"; then
    fail "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST is enabled by the app that launched this shell, so Claude will ignore Arena settings in ~/.claude/settings.json. Nothing changed; run setup from a normal terminal for standalone Claude, or configure the host app to route through Arena."
    return 1
  fi
}

# Claude reads an inherited Unix-socket transport before applying user-settings
# environment values. An empty user setting therefore cannot make the HTTP base
# URL win, so fail before accepting a token or changing configuration.
guard_inherited_unix_socket_setup() {
  if [ -n "${ANTHROPIC_UNIX_SOCKET:-}" ]; then
    fail "ANTHROPIC_UNIX_SOCKET is set in the environment that launched this shell, so Claude would bypass Arena's HTTP endpoint. Nothing changed; unset ANTHROPIC_UNIX_SOCKET in a normal terminal and re-run setup."
    return 1
  fi
}

# Refuse before storing a token or editing any config when setup itself is
# running inside Claude Code. Editing user settings from that process can
# rewire the session performing the install. A sandboxed test can opt in.
guard_live_claude_setup() {
  if [ "${CLAUDECODE:-}" != "1" ] && [ -z "${CLAUDE_CODE_ENTRYPOINT:-}" ]; then
    return 0
  fi
  warn "this shell is inside a running Claude Code session — configuring claude here would rewire that session and every other Claude Code session on this machine."
  if [ "$(confirm "Configure claude anyway?" "n")" != "y" ]; then
    fail "nothing changed. Run this from a normal terminal, or test with a sandbox HOME (HOME=/tmp/arena-sandbox)."
    return 1
  fi
}

# Removing the helper or token can break the Claude process performing the
# uninstall on its next request. Require the same explicit override used by
# setup, and default to leaving the machine untouched.
guard_live_claude_uninstall() {
  if [ "${CLAUDECODE:-}" != "1" ] && [ -z "${CLAUDE_CODE_ENTRYPOINT:-}" ]; then
    return 0
  fi
  warn "this shell is inside a running Claude Code session — uninstalling here can remove credentials that session still needs."
  if [ "$(confirm "Uninstall anyway?" "n")" != "y" ]; then
    fail "nothing changed. Run uninstall from a normal terminal after closing Claude."
    return 1
  fi
}

# Prompt for an Arena Router token and stage it in a private temporary file.
# The Claude transaction moves it into place only after every preflight check
# has passed, so bad JSON or a conflicting rerun leaves no partial install.
# Opens the portal in the browser so there's no URL to copy around (skipped
# when stdin isn't a terminal — scripted runs shouldn't launch browsers).
PENDING_TOKEN_FILE="-"
prepare_model_list() {
  ARENA_SETUP_MODELS_FILE="$(mktemp "${TMPDIR:-/tmp}/arena-models.XXXXXX")" || return 1
  export ARENA_SETUP_MODELS_FILE
  trap cleanup_staged_token EXIT
}

finish_model_list() {
  export ARENA_SETUP_GATEWAY_URL="$base_url"
  default_model="$(claude_lifecycle model-notices "$default_model")" || {
    fail "could not discover permitted models; no client configuration changed"
    return 1
  }
}

# Write only the token to stdout; prompts and mask characters go to stderr.
# Python already manages installer state, so no extra dependency is needed.
read_token() {
  if [ ! -t 0 ]; then
    local value
    IFS= read -r value || return 1
    printf '%s' "$value"
    return 0
  fi
  python3 - 3<&0 <<'PYEOF'
import os
import signal
import sys
import termios

fd = 3
original = termios.tcgetattr(fd)
masked = termios.tcgetattr(fd)
# Read control keys ourselves so Ctrl-Z cannot suspend the prompt and let the
# shell restore echo before token entry resumes. Other signals keep handlers.
masked[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG)
masked[6][termios.VMIN] = 1
masked[6][termios.VTIME] = 0
token = bytearray()
prompt = 'Paste it here (input is masked, Enter submits, Ctrl-C cancels): '

def redraw() -> None:
    # Keep the editable mask on one row, even for long keys. Backspacing
    # across a terminal's automatic wrap otherwise leaves stale asterisks.
    width = os.get_terminal_size(fd).columns or 80
    label = prompt if width > len(prompt) + 1 else 'Token: '
    label = label[:max(0, width - 2)]
    stars = '*' * min(len(token), max(1, width - len(label) - 1))
    sys.stderr.write('\r\x1b[2K' + label + stars)
    sys.stderr.flush()

def interrupted(signum: int, _frame: object) -> None:
    raise SystemExit(128 + signum)

for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT):
    signal.signal(signum, interrupted)
signal.signal(signal.SIGINT, signal.default_int_handler)
try:
    termios.tcsetattr(fd, termios.TCSANOW, masked)
    redraw()
    while True:
        char = os.read(fd, 1)
        if not char or char == b'\x04':
            raise SystemExit(1)
        if char in (b'\r', b'\n'):
            break
        if char in (b'\x03', b'\x1b'):
            raise SystemExit(130)
        if char == b'\x1c':
            raise SystemExit(128 + signal.SIGQUIT)
        if char == b'\x1a':
            continue
        if char in (b'\x7f', b'\x08', b'\x15', b'\x17'):
            count = 0
            if char == b'\x15':
                count = len(token)
            elif char == b'\x17':
                end = len(token.rstrip())
                start = token.rfind(b' ', 0, end) + 1
                count = len(token) - start
            elif token:
                count = 1
            if count:
                del token[-count:]
        elif b' ' <= char <= b'~':
            token.extend(char)
        redraw()
    sys.stdout.buffer.write(token)
except KeyboardInterrupt:
    raise SystemExit(130)
finally:
    termios.tcsetattr(fd, termios.TCSANOW, original)
    sys.stderr.write('\n')
    sys.stderr.flush()
PYEOF
}

stage_token() {
  local token=""
  if [ -t 0 ]; then
    printf 'Press %s to open %s and create an API token (esc cancels) ' "$(bold "Enter")" "$PORTAL_URL"
    local key=""
    IFS= read -rsn1 key || key=$'\x1b'
    printf '\n'
    case "$key" in
      $'\x1b'|q|Q|$'\x04') on_cancel ;;
    esac
    open_browser "$PORTAL_URL" || warn "could not open a browser — visit the URL above."
  else
    info "Create an API token at $PORTAL_URL"
  fi
  # Verify the token against the API before saving. A wrong, revoked, or
  # wrong-environment key otherwise "installs
  # fine" and surfaces later as Claude Code retrying 401s.
  while :; do
    token=""
    while [ -z "$token" ]; do
      local input_status
      if [ ! -t 0 ]; then printf 'Paste it here (Ctrl-C cancels): '; fi
      if token="$(read_token)"; then
        input_status=0
      else
        input_status=$?
      fi
      if [ ! -t 0 ]; then printf '\n'; fi
      if [ "$input_status" -ge 128 ]; then on_cancel; fi
      if [ "$input_status" -ne 0 ]; then
        fail "token input ended before a token was provided; nothing changed"
        return 1
      fi
      case "$token" in
        $'\x1b'*) on_cancel ;;
      esac
    done
    local probe_status
    if [ -n "${ARENA_SETUP_TEST_TOKEN_STATUS:-}" ]; then
      probe_status="$ARENA_SETUP_TEST_TOKEN_STATUS"
      if [ "$probe_status" = "200" ]; then
        printf '%s' "${ARENA_SETUP_TEST_MODELS:-}" > "$ARENA_SETUP_MODELS_FILE"
      fi
    else
      probe_status="$({
        printf 'Authorization: Bearer %s\n' "$token"
      } | curl -sS -m 10 -o "$ARENA_SETUP_MODELS_FILE" -w '%{http_code}' \
          -H @- -H "User-Agent: arenarouter-setup.sh" \
          "${PORTAL_URL%/dashboard/keys}/api/scripts/setup/models" 2>/dev/null)" || probe_status=""
    fi
    [ "$probe_status" = "200" ] || : > "$ARENA_SETUP_MODELS_FILE"
    case "$probe_status" in
      200)
        ok "token verified against $base_url"
        break
        ;;
      401|403)
        warn "that token did not authenticate against $base_url (HTTP $probe_status) — make sure you copied the full key, from the same environment."
        if [ "$(confirm "Save it anyway?" "n")" = "y" ]; then break; fi
        ;;
      *)
        warn "could not reach ${PORTAL_URL%/dashboard/keys}/api/scripts/setup/models to verify the token — saving it unverified."
        break
        ;;
    esac
  done
  PENDING_TOKEN_FILE="$(mktemp "${TMPDIR:-/tmp}/arena-token.XXXXXX")" || {
    fail "could not create a private temporary token file"
    return 1
  }
  chmod 600 "$PENDING_TOKEN_FILE" || { rm -f "$PENDING_TOKEN_FILE"; PENDING_TOKEN_FILE="-"; return 1; }
  printf '%s' "$token" > "$PENDING_TOKEN_FILE" || {
    rm -f "$PENDING_TOKEN_FILE"
    PENDING_TOKEN_FILE="-"
    fail "could not stage the Arena token"
    return 1
  }
  trap cleanup_staged_token EXIT
  # Keep SIGINT's default disposition while prompts are still possible;
  # bash 3.2 defers a trapped SIGINT during read -n until another keypress.
  trap 'cleanup_staged_token; exit 130' HUP
  trap on_cancel TERM
}

cleanup_staged_token() {
  if [ "${PENDING_TOKEN_FILE:--}" != "-" ]; then
    rm -f "$PENDING_TOKEN_FILE"
  fi
  PENDING_TOKEN_FILE="-"
  if [ -n "${ARENA_SETUP_MODELS_FILE:-}" ]; then
    rm -f "$ARENA_SETUP_MODELS_FILE"
    unset ARENA_SETUP_MODELS_FILE
  fi
}

# Validate an existing token with the same non-billed catalog request used for
# newly pasted tokens. The token is supplied through curl's stdin-backed header
# file, so it never appears in argv or diagnostics.
probe_token_file() {
  local token_path="$1" status curl_rc
  if [ ! -s "$token_path" ]; then
    printf '401'
    return 0
  fi
  if [ -n "${ARENA_SETUP_TEST_TOKEN_STATUS:-}" ]; then
    if [ "$ARENA_SETUP_TEST_TOKEN_STATUS" = "200" ]; then
      printf '%s' "${ARENA_SETUP_TEST_MODELS:-}" > "$ARENA_SETUP_MODELS_FILE"
    fi
    printf '%s' "$ARENA_SETUP_TEST_TOKEN_STATUS"
    return 0
  fi
  status="$({
    printf 'Authorization: Bearer '
    cat "$token_path"
    printf '\n'
  } | curl -sS --max-time 10 --max-filesize 1048576 -o "$ARENA_SETUP_MODELS_FILE" -w '%{http_code}' \
      -H @- -H "User-Agent: arenarouter-setup.sh" \
      "${PORTAL_URL%/dashboard/keys}/api/scripts/setup/models" 2>/dev/null)"
  curl_rc=$?
  [ "$curl_rc" -eq 0 ] || status=""
  [ "$status" = "200" ] || : > "$ARENA_SETUP_MODELS_FILE"
  printf '%s' "$status"
}

validate_stored_token() {
  local status
  status="$(probe_token_file "$TOKEN_FILE")"
  case "$status" in
    200)
      ok "stored token verified against $base_url"
      return 0
      ;;
    401|403)
      warn "the stored token at $TOKEN_FILE no longer authenticates against $base_url (HTTP $status)."
      return 1
      ;;
    *)
      if [ "${SYNC_MODELS:-0}" != "1" ]; then
        warn "could not reach ${PORTAL_URL%/dashboard/keys}/api/scripts/setup/models to verify the stored token — continuing unverified."
      fi
      return 0
      ;;
  esac
}

open_browser() {
  local url="$1"
  case "$(uname -s)" in
    Darwin) open "$url" >/dev/null 2>&1 ;;
    *) if command -v xdg-open >/dev/null 2>&1; then
         xdg-open "$url" >/dev/null 2>&1
       else
         cmd.exe /c start "" "$url" >/dev/null 2>&1
       fi ;;
  esac
}

print_change_summary() {
  if [ ${#CHANGES[@]} -gt 0 ]; then
    info "Changes made:"
    local c
    for c in "${CHANGES[@]}"; do
      info "  - $c"
    done
  else
    info "No changes were made."
  fi
}

# User settings are not Claude's highest-precedence layer. Managed policy and
# project-local settings can replace the auth helper, endpoint, model, or cloud
# provider selectors we are about to install. Check the current project plus
# machine-managed locations before asking for a token; other projects are
# checked by their own install run.
check_claude_precedence() {
  local claude_dir settings_path conflicts rc
  claude_dir="$(expanduser "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")"
  settings_path="$claude_dir/settings.json"
  conflicts="$(python3 - "$PWD" "$settings_path" "$base_url" "$CLAUDE_HELPER" "$default_model" <<'PYEOF'
import json, os, re, shlex, sys

cwd, user_settings, base_url, helper, model = sys.argv[1:6]
expected = {
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_AUTH_TOKEN": "",
    "ANTHROPIC_BASE_URL": base_url,
    "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT": "1",
    # These transports cannot be neutralized from user settings, but a
    # higher-precedence settings layer that enables either one must still be
    # reported as a conflict.
    "ANTHROPIC_UNIX_SOCKET": "",
    "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST": "",
    "CLAUDE_CODE_USE_ANTHROPIC_AWS": "",
    "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD": "",
    "CLAUDE_CODE_USE_BEDROCK": "",
    "CLAUDE_CODE_USE_FOUNDRY": "",
    "CLAUDE_CODE_USE_GATEWAY": "",
    "CLAUDE_CODE_USE_MANTLE": "",
    "CLAUDE_CODE_USE_VERTEX": "",
}
# Match the lifecycle writer and the Claude Code capability selector semantics.
capability_model = re.sub(r"\[1m\]", "", model, flags=re.IGNORECASE)
if capability_model in {
    "coding-router-preview", "claude-coding-router-preview", "claude-max-v0", "max-v0",
}:
    expected["CLAUDE_CODE_MODEL_CAPABILITIES"] = capability_model + "=-effort"
for key in (
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
):
    expected[key] = ""
for key in (
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
):
    expected[key] = model

paths = []
for managed in (
    "/Library/Application Support/ClaudeCode/managed-settings.json",
    "/etc/claude-code/managed-settings.json",
):
    if os.path.exists(managed):
        paths.append(("managed", managed))

current = os.path.abspath(cwd)
seen = set()
while True:
    for name in ("settings.json", "settings.local.json"):
        path = os.path.join(current, ".claude", name)
        if os.path.realpath(path) != os.path.realpath(user_settings) and os.path.exists(path):
            paths.append(("project", path))
    # Claude project settings belong to the current repository. Do not keep
    # walking into the user home and misclassify ~/.claude/settings.json as
    # a project override when setup is launched somewhere beneath $HOME.
    if os.path.lexists(os.path.join(current, ".git")):
        break
    parent = os.path.dirname(current)
    if parent == current:
        break
    current = parent

problems = []
for layer, path in paths:
    real = os.path.realpath(path)
    if real in seen:
        continue
    seen.add(real)
    try:
        with open(real, encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError("top-level value is not an object")
    except Exception as exc:
        problems.append(f"{layer} {path}: unreadable or invalid JSON ({exc})")
        continue
    env = data.get("env")
    if isinstance(env, dict):
        for key, wanted in expected.items():
            if key == "CLAUDE_CODE_MODEL_CAPABILITIES" and key in env:
                effort = None
                if isinstance(env[key], str):
                    for entry in env[key].split(";"):
                        selector, separator, flags = entry.partition("=")
                        if separator:
                            selector = selector.strip()
                            if not selector or not (
                                capability_model.startswith(selector[:-1]) if selector.endswith("*") else capability_model == selector
                            ):
                                continue
                        else:
                            flags = entry
                        for flag in flags.split(","):
                            flag = flag.strip()
                            if flag in ("effort", "-effort"):
                                effort = flag == "effort"
                if effort is not False:
                    problems.append(f"{layer} {path}: env.{key}")
                continue
            if key in env and env[key] != wanted:
                problems.append(f"{layer} {path}: env.{key}")
    if "apiKeyHelper" in data and data["apiKeyHelper"] != shlex.quote(helper):
        problems.append(f"{layer} {path}: apiKeyHelper")
    if "modelPicker" in data:
        problems.append(f"{layer} {path}: modelPicker")

print("\n".join(problems))
PYEOF
)"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "could not inspect higher-precedence Claude settings"
    return "$rc"
  fi
  [ -n "$conflicts" ] || return 0

  warn "higher-precedence Claude settings in this context can override Arena:"
  while IFS= read -r line; do [ -n "$line" ] && printf '  - %s\n' "$(detilde "$line")" >&2; done <<<"$conflicts"
  if [ "${ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS:-}" = "1" ]; then
    warn "continuing because ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 0
  fi
  if [ "${ARENA_SETUP_NONINTERACTIVE:-}" = "1" ]; then
    fail "nothing changed; remove the overrides or set ARENA_SETUP_ALLOW_PRECEDENCE_CONFLICTS=1"
    return 1
  fi
  if [ "$(confirm "Install user-wide Arena settings anyway?" n)" != "y" ]; then
    fail "nothing changed"
    return 1
  fi
}

configure_claude() { configure_harness claude; }

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------

report_preserved_legacy_claude_backup() {
  local backup
  backup="$(expanduser "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")/settings.json.arena-backup"
  if [ -f "$backup" ]; then
    warn "kept legacy recovery backup $backup because this pre-receipt install cannot prove who created it"
    info "Re-running setup will continue to preserve this pre-existing backup; remove it manually only if you know an older Arena setup created it."
  fi
}

do_uninstall() {
  # Receipt-governed uninstall: list what the receipt owns, let the user pick,
  # then release each selected section. Shared files go with the last section
  # unless retained settings still need the token. Receipt-less installs take
  # the legacy path below.
  local result rc line
  if [ -f "$STATE_FILE" ] || [ -f "$TRANSACTION_FILE" ]; then
    claude_lifecycle recover "$TRANSACTION_FILE" || {
      fail "could not recover an interrupted Arena installer transaction"
      return 1
    }
  fi
  if [ ! -f "$STATE_FILE" ]; then
    do_uninstall_receiptless
    return
  fi

  step "Tools"
  choose_uninstall_targets || return 1
  if harness_selected claude; then
    guard_live_claude_uninstall || return 1
  fi
  info "Values changed after setup are kept and reported instead of overwritten."
  local removal="$(selected_harness_labels)"
  if all_owned_harnesses_selected; then
    removal="$removal and the Arena token"
  else
    info "The Arena token stays because another tool still uses it."
  fi
  if [ "$HARNESS_PICKER_INTERACTIVE" = "1" ]; then
    # The picker's Continue action was the confirmation; do not ask twice.
    info "Removing $removal."
  elif [ "$(confirm "Remove $removal?" y)" != "y" ]; then
    info "Nothing changed."
    return 0
  fi

  if harness_selected claude; then
    step "Claude"
    result="$(claude_lifecycle uninstall "$STATE_FILE" "$TRANSACTION_FILE")"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      fail "uninstall failed; the installed configuration and recovery receipt were retained"
      return "$rc"
    fi
    ok "restored the recorded pre-Arena Claude configuration"
    note_change "restored Claude settings and installer-owned files"
    while IFS= read -r line; do
      case "$line" in
        "PRESERVED token referenced by OpenCode") warn "keeping $TOKEN_FILE because preserved OpenCode settings still reference it" ;;
        "PRESERVED helper referenced by Codex") warn "keeping $CLAUDE_HELPER because preserved Codex settings still reference it" ;;
        "PRESERVED token referenced by Codex") warn "keeping $TOKEN_FILE because the preserved Codex helper prints it" ;;
        "PRESERVED "*) warn "keeping ${line#PRESERVED } because it changed after setup" ;;
      esac
    done <<<"$result"
  fi

  if harness_selected opencode; then
    step "OpenCode"
    result="$(claude_lifecycle uninstall-opencode "$STATE_FILE" "$TRANSACTION_FILE")"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      fail "OpenCode uninstall failed; the installed configuration and recovery receipt were retained"
      return "$rc"
    fi
    ok "restored the recorded pre-Arena OpenCode configuration"
    note_change "restored OpenCode config"
    while IFS= read -r line; do
      case "$line" in
        "PRESERVED token referenced by OpenCode") warn "keeping $TOKEN_FILE because preserved OpenCode settings still reference it" ;;
        "PRESERVED helper referenced by Codex") warn "keeping $CLAUDE_HELPER because preserved Codex settings still reference it" ;;
        "PRESERVED token referenced by Codex") warn "keeping $TOKEN_FILE because the preserved Codex helper prints it" ;;
        "PRESERVED "*) warn "keeping ${line#PRESERVED } because it changed after setup" ;;
      esac
    done <<<"$result"
  fi

  if harness_selected codex; then
    step "Codex"
    result="$(claude_lifecycle uninstall-codex "$STATE_FILE" "$TRANSACTION_FILE")"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      fail "Codex uninstall failed; the installed configuration and recovery receipt were retained"
      return "$rc"
    fi
    ok "restored the recorded pre-Arena Codex configuration"
    note_change "restored Codex config"
    while IFS= read -r line; do
      case "$line" in
        "PRESERVED token referenced by OpenCode") warn "keeping $TOKEN_FILE because preserved OpenCode settings still reference it" ;;
        "PRESERVED helper referenced by Codex") warn "keeping $CLAUDE_HELPER because preserved Codex settings still reference it" ;;
        "PRESERVED token referenced by Codex") warn "keeping $TOKEN_FILE because the preserved Codex helper prints it" ;;
        "PRESERVED "*) warn "keeping ${line#PRESERVED } because it changed after setup" ;;
      esac
    done <<<"$result"
  fi

  step "Done"
  if harness_selected claude; then
    note_live_sessions_uninstall
  fi
  if harness_selected opencode; then
    note_live_opencode_sessions
  fi
  if harness_selected codex; then
    note_live_codex_sessions
  fi
  if [ -f "$STATE_FILE" ]; then
    info "Other tools are still routed through Arena; run setup again to add a tool back."
  fi
  print_change_summary
  return 0
}

# Receipt-less Claude installs predate safe ownership tracking. Restore only
# recognizable Claude fields and preserve ambiguous files.
# Traces a receipt-less (pre-receipt) Arena setup could have left, one per
# line as "path — what it is". Empty output means nothing to clean up.
arena_trace_list() {
  local settings_path
  settings_path="$(claude_settings_path)"
  [ -e "$TOKEN_FILE" ] && printf '%s — Arena token file\n' "$(detilde "$TOKEN_FILE")"
  [ -e "$CLAUDE_HELPER" ] && printf '%s — Claude Code key helper\n' "$(detilde "$CLAUDE_HELPER")"
  [ -e "$settings_path.arena-backup" ] && printf '%s — settings backup\n' "$(detilde "$settings_path.arena-backup")"
  [ -e "$settings_path" ] || return 0
  python3 - "$settings_path" <<'PYEOF'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    sys.exit(0)
env = data.get("env") if isinstance(data, dict) else None
env = env if isinstance(env, dict) else {}
bases = {
    "https://api.preview.arena.ai",
    "https://api-gateway.staging.spicyarena.ai",
    "https://api-gateway-k8s.staging.spicyarena.ai",
    "https://api-gateway-k8s.dev.spicyarena.ai",
    "http://localhost:9200",
    "http://gateway.arena.localtest.me",
}
models = {"max-v0", "claude-max-v0", "coding-router-preview"}
helper = str(data.get("apiKeyHelper", "")) if isinstance(data, dict) else ""
found = []
if env.get("ANTHROPIC_BASE_URL") in bases:
    found.append("ANTHROPIC_BASE_URL=" + env["ANTHROPIC_BASE_URL"])
if env.get("ANTHROPIC_MODEL") in models:
    found.append("ANTHROPIC_MODEL=" + env["ANTHROPIC_MODEL"])
if "claude-api-key-helper.sh" in helper:
    found.append("apiKeyHelper")
if found:
    print(sys.argv[1] + " — Arena values in Claude settings (" + ", ".join(found) + ")")
PYEOF
}

# Receipt-less path. Nothing from this installer is on the machine (it always
# writes a receipt); there may be leftovers from an older Arena setup.
do_uninstall_receiptless() {
  local verdict
  verdict="$(ARENA_SETUP_LEGACY_DRY_RUN=1 uninstall_claude_verdict)"
  case "$verdict" in
    WOULD_DELETE|WOULD_RESTORE|WOULD_UPDATE) ;;
    *)
      # Nothing this installer wrote is here (it always leaves a receipt), and
      # nothing matches an older Arena installer's layout either.
      info "Nothing to uninstall."
      return 0
      ;;
  esac
  info "An older Arena setup (before install receipts) is configured for this home ($(detilde "$HOME"))."
  info "Cleanup restores the values it wrote; anything changed since is kept and reported."
  if [ "$(confirm "Clean it up?" y)" != "y" ]; then
    info "Nothing changed."
    return 0
  fi
  guard_live_claude_uninstall || return 1

  step "Claude"
  if ! uninstall_claude; then
    fail "legacy Claude uninstall failed; token and backups were retained"
    return 1
  fi

  step "Token"
  if [ -f "$TOKEN_FILE" ] || [ -f "$CLAUDE_HELPER" ]; then
    warn "kept legacy $TOKEN_FILE and/or $CLAUDE_HELPER because this install has no ownership receipt"
    info "Re-running setup will record these as pre-existing and preserve them again; remove them manually only if you know an older Arena setup created them."
  fi

  step "Backup"
  report_preserved_legacy_claude_backup

  step "Done"
  note_live_sessions_uninstall
  print_change_summary
}

# Same inspection as uninstall_claude, printing only the verdict. With
# ARENA_SETUP_LEGACY_DRY_RUN=1 the Python writes nothing.
uninstall_claude_verdict() {
  local claude_dir settings_path backup
  claude_dir="$(expanduser "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")"
  settings_path="$claude_dir/settings.json"
  backup="$settings_path.arena-backup"
  legacy_claude_python "$settings_path" "$backup" 2>/dev/null || printf 'ERROR'
}

uninstall_claude() {
  local claude_dir settings_path backup result
  claude_dir="$(expanduser "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")"
  settings_path="$claude_dir/settings.json"
  backup="$settings_path.arena-backup"
  result="$(legacy_claude_python "$settings_path" "$backup")" || result="ERROR"
  case "$result" in
    RESTORED)
      ok "claude: restored unchanged legacy Arena fields in $settings_path"
      note_change "restored $settings_path"
      ;;
    UPDATED)
      ok "claude: removed unchanged legacy Arena fields from $settings_path"
      note_change "updated $settings_path"
      ;;
    DELETED)
      ok "claude: removed $settings_path (it held only recognizable legacy Arena settings)"
      note_change "deleted $settings_path"
      ;;
    PRESERVED)
      warn "claude: kept $settings_path because this receipt-less configuration is not provably owned by Arena"
      ;;
    UNCHANGED)
      info "claude: no recognizable legacy Arena settings to undo."
      ;;
    *) fail "claude: could not safely inspect or restore $settings_path"; return 1 ;;
  esac
}

legacy_claude_python() {
  local settings_path="$1" backup="$2"
  python3 - "$settings_path" "$backup" "$CLAUDE_HELPER" \
      "$TOKEN_FILE" <<'PYEOF'
import copy, json, os, shlex, stat, sys, tempfile

path, backup_path, helper_path, token_path = sys.argv[1:5]

if not os.path.lexists(path):
    print("UNCHANGED")
    sys.exit(0)
if os.path.islink(path):
    print("PRESERVED")
    sys.exit(0)

def load_json(source):
    with open(source, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{source} is not a JSON object")
    env = data.get("env")
    if env is not None and not isinstance(env, dict):
        raise ValueError(f"{source} field env is not an object")
    return data

def leaf(root, keys):
    node = root
    for key in keys[:-1]:
        if not isinstance(node, dict) or key not in node:
            return (False, None)
        node = node[key]
    if isinstance(node, dict) and keys[-1] in node:
        return (True, node[keys[-1]])
    return (False, None)

def put(root, keys, state):
    node = root
    parents = []
    for key in keys[:-1]:
        child = node.get(key)
        if not isinstance(child, dict):
            child = {}
            node[key] = child
        parents.append((node, key))
        node = child
    present, value = state
    if present:
        node[keys[-1]] = copy.deepcopy(value)
        return
    node.pop(keys[-1], None)
    for parent, key in reversed(parents):
        child = parent.get(key)
        if isinstance(child, dict) and not child:
            parent.pop(key, None)
        else:
            break

if os.path.lexists(backup_path) and (
    os.path.islink(backup_path) or not os.path.isfile(backup_path)
):
    # A receipt-less uninstall cannot prove where a final backup symlink
    # points or who owns a special entry. Do not use it as restoration data.
    print("PRESERVED")
    sys.exit(0)

try:
    current = load_json(path)
    before = load_json(backup_path) if os.path.isfile(backup_path) else None
except Exception as exc:
    sys.stderr.write(f"arena setup: could not inspect legacy Claude settings: {exc}\n")
    sys.exit(1)

# Model historical installers independently of whichever environment served
# this uninstall script. Otherwise a production script cannot recognize and
# undo a staging/dev/local install.
legacy_bases = (
    "https://api.preview.arena.ai",
    "https://api-gateway.staging.spicyarena.ai",
    "https://api-gateway-k8s.staging.spicyarena.ai",
    "https://api-gateway-k8s.dev.spicyarena.ai",
    "http://localhost:9200",
    "http://gateway.arena.localtest.me",
)
legacy_models = ("max-v0", "claude-max-v0", "coding-router-preview")
intermediate_aliases = (
    "ANTHROPIC_DEFAULT_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
)

def normalize(value):
    return os.path.abspath(os.path.expanduser(value))

def exact_helper_setting(value):
    return isinstance(value, str) and value in {
        helper_path,
        shlex.quote(helper_path),
    }

def exact_legacy_plumbing():
    if (
        not os.path.isfile(token_path)
        or os.path.islink(token_path)
        or not os.path.isfile(helper_path)
        or os.path.islink(helper_path)
    ):
        return False
    try:
        with open(helper_path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except (OSError, UnicodeDecodeError):
        return False
    if len(lines) != 2 or lines[0] != "#!/usr/bin/env bash":
        return False
    try:
        command = shlex.split(lines[1])
    except ValueError:
        return False
    if len(command) == 2 and command[0] == "cat":
        candidate = command[1]
    elif len(command) == 3 and command[:2] == ["exec", "cat"]:
        candidate = command[2]
    else:
        return False
    return normalize(candidate) == normalize(token_path)

env = current.get("env", {})
helper_anchor = exact_helper_setting(current.get("apiKeyHelper"))
base_and_model_anchor = (
    env.get("ANTHROPIC_BASE_URL") in legacy_bases
    and env.get("ANTHROPIC_MODEL") in legacy_models
)
intermediate_values = [env.get(name) for name in intermediate_aliases]
intermediate_fingerprint = (
    intermediate_values
    and all(isinstance(value, str) for value in intermediate_values)
    and len(set(intermediate_values)) == 1
    and intermediate_values[0] in legacy_models
)

cohort = None
if exact_legacy_plumbing():
    if (
        env.get("ANTHROPIC_API_KEY") == ""
        and env.get("ANTHROPIC_AUTH_TOKEN") == ""
        and intermediate_fingerprint
    ):
        cohort = "intermediate"
    elif helper_anchor or base_and_model_anchor:
        cohort = "committed"
if cohort is None:
    print("PRESERVED")
    sys.exit(0)

installed_states = {
    ("env", "ANTHROPIC_API_KEY"): ((False, None),),
    ("env", "ANTHROPIC_AUTH_TOKEN"): ((False, None),),
    ("env", "ANTHROPIC_BASE_URL"): tuple((True, value) for value in legacy_bases),
    ("env", "ANTHROPIC_MODEL"): tuple((True, value) for value in legacy_models),
    ("apiKeyHelper",): tuple(
        (True, value) for value in {helper_path, shlex.quote(helper_path)}
    ),
}
if cohort == "intermediate":
    installed_states[("env", "ANTHROPIC_API_KEY")] = ((True, ""),)
    installed_states[("env", "ANTHROPIC_AUTH_TOKEN")] = ((True, ""),)
    for name in ("ANTHROPIC_MODEL", *intermediate_aliases):
        installed_states[("env", name)] = tuple(
            (True, value) for value in legacy_models
        )
    installed_states.update(
        {
            ("env", "CLAUDE_CODE_USE_BEDROCK"): ((True, ""),),
            ("env", "CLAUDE_CODE_USE_VERTEX"): ((True, ""),),
            ("env", "CLAUDE_CODE_USE_FOUNDRY"): ((True, ""),),
            ("env", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"): ((True, "1"),),
        }
    )

updated = copy.deepcopy(current)
for keys, installed in installed_states.items():
    if leaf(updated, keys) in installed:
        put(updated, keys, leaf(before, keys) if before is not None else (False, None))

if updated == current:
    print("UNCHANGED")
    sys.exit(0)
if os.environ.get("ARENA_SETUP_LEGACY_DRY_RUN") == "1":
    # Report what a cleanup would do without touching anything.
    print("WOULD_DELETE" if not updated else ("WOULD_RESTORE" if before is not None else "WOULD_UPDATE"))
    sys.exit(0)
if not updated:
    os.unlink(path)
    print("DELETED")
    sys.exit(0)

mode = stat.S_IMODE(os.stat(path).st_mode)
parent = os.path.dirname(path) or "."
descriptor, temporary = tempfile.mkstemp(prefix=".arena-legacy-", dir=parent)
try:
    os.fchmod(descriptor, mode)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(updated, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
except BaseException:
    try:
        os.close(descriptor)
    except OSError:
        pass
    try:
        os.unlink(temporary)
    except OSError:
        pass
    raise
print("RESTORED" if before is not None else "UPDATED")
PYEOF
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


# Support `curl -fsSL …/setup.sh | bash`. When piped, the program text occupies
# stdin, so interactive prompts must
# read the terminal instead — run the flow with stdin reattached to
# /dev/tty when one exists. Fully non-interactive runs keep the piped stdin
# and plain-prompt fallbacks; ARENA_SETUP_NONINTERACTIVE=1 forces that mode
# for deterministic automation even when the parent process owns a TTY.
arena_main() {
case "${1:-}" in
  "")
    if ! command -v python3 >/dev/null 2>&1; then
      fail "python3 is required for safe configuration backup and restoration"
      exit 1
    fi
    trap on_cancel TERM
    banner
    case "$(choose_action)" in
      cancel) info "Nothing changed."; exit 0 ;;
      uninstall) run_mutating_action do_uninstall ;;
      sync) run_mutating_action do_sync ;;
      *) run_mutating_action do_setup ;;
    esac
    ;;
  --help|-h)
    cat <<EOF
Usage: $0
Interactive menu: setup, update models or uninstall. This script takes no arguments other
than --help.

Setup detects Claude Code, OpenCode, and Codex and asks which to configure;
uninstall lists what the receipt owns and asks which to remove. Preselect
either with ARENA_SETUP_HARNESSES=claude,opencode,codex (used as-is when stdin
is not a TTY). Codex is offered only when the portal serving this script has
it switched on (CODEX_ENABLED=$CODEX_ENABLED in this copy).

Update models refreshes only model settings for the tools in the receipt,
using the stored token. Use ARENA_SETUP_ACTION=sync for an unattended refresh.

Defaults: base URL $DEFAULT_BASE_URL, model $DEFAULT_MODEL.
Override with ARENA_BASE_URL / ARENA_DEFAULT_MODEL; ARENA_PORTAL_URL changes
the keys-page link and model discovery endpoint.
EOF
    ;;
  *)
    fail "unknown command '$1' — this script takes no arguments other than --help; run '$0' with none for the interactive menu"
    exit 2
    ;;
esac
}

if [ "${ARENA_SETUP_NONINTERACTIVE:-}" != "1" ] && [ ! -t 0 ] && (: </dev/tty) 2>/dev/null; then
  arena_main "$@" </dev/tty
else
  arena_main "$@"
fi
