#!/bin/bash
# Local controller for the /wish automation cron jobs.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${WISH_LOCAL_ENV_FILE:-${ROOT_DIR}/.wish-local.env}"
LOG_DIR="${WISH_LOG_DIR:-${ROOT_DIR}/logs/wish}"
WORKER_BASE_URL_DEFAULT="https://telegram-bot.luyiqi-lili.workers.dev"
DEFAULT_PATH="${HOME}/.local/bin:${HOME}/.nvm/versions/node/v20.19.3/bin:${HOME}/.local/share/pnpm:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH="${DEFAULT_PATH}:${PATH:-}"

usage() {
	cat <<EOF
Usage: scripts/wish-local.sh <command>

Commands:
  setup          Create or update ${ENV_FILE}
  install-cron   Install digest every 10 minutes and executor every 5 minutes
  uninstall-cron Remove wish cron entries
  status         Show local config and cron status
  digest         Run one pending-wish digest now
  execute        Run one approved-wish execution now
  run-once       Run digest, then executor once
EOF
}

value_from_notify_script() {
	local name="$1"
	sed -n "s/^${name}=\"\\(.*\\)\"/\\1/p" "${ROOT_DIR}/scripts/notify-deploy.sh" | head -1
}

require_tty() {
	if [ ! -t 0 ]; then
		echo "This command needs a terminal. Run it manually: scripts/wish-local.sh setup" >&2
		exit 1
	fi
}

write_env_file() {
	require_tty

	local worker_base_url="${WORKER_BASE_URL:-$WORKER_BASE_URL_DEFAULT}"
	local bot_token="${BOT_TOKEN:-$(value_from_notify_script BOT_TOKEN)}"
	local chat_id="${CHAT_ID:-$(value_from_notify_script CHAT_ID)}"
	local topic_id="${TOPIC_ID:-$(value_from_notify_script TOPIC_ID)}"
	local verify_cmd="${WISH_VERIFY_CMD:-npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts}"
	local external_api_key="${EXTERNAL_API_KEY:-}"

	echo "Creating local wish automation config:"
	echo "  ${ENV_FILE}"
	echo
	read -r -p "WORKER_BASE_URL [${worker_base_url}]: " input_worker_base_url
	worker_base_url="${input_worker_base_url:-$worker_base_url}"

	read -r -p "BOT_TOKEN [from notify-deploy.sh]: " input_bot_token
	bot_token="${input_bot_token:-$bot_token}"

	read -r -p "CHAT_ID [${chat_id}]: " input_chat_id
	chat_id="${input_chat_id:-$chat_id}"

	read -r -p "TOPIC_ID [${topic_id}]: " input_topic_id
	topic_id="${input_topic_id:-$topic_id}"

	if [ -n "$external_api_key" ]; then
		read -r -p "EXTERNAL_API_KEY [current env value]: " input_external_api_key
		external_api_key="${input_external_api_key:-$external_api_key}"
	else
		read -r -s -p "EXTERNAL_API_KEY: " external_api_key
		echo
	fi

	if [ -z "$external_api_key" ]; then
		echo "EXTERNAL_API_KEY is required." >&2
		exit 1
	fi
	if [ -z "$worker_base_url" ] || [ -z "$bot_token" ] || [ -z "$chat_id" ] || [ -z "$topic_id" ]; then
		echo "WORKER_BASE_URL, BOT_TOKEN, CHAT_ID, and TOPIC_ID are required." >&2
		exit 1
	fi

	umask 077
	cat > "$ENV_FILE" <<EOF
export WORKER_BASE_URL="${worker_base_url}"
export EXTERNAL_API_KEY="${external_api_key}"
export BOT_TOKEN="${bot_token}"
export CHAT_ID="${chat_id}"
export TOPIC_ID="${topic_id}"
export WISH_VERIFY_CMD="${verify_cmd}"
EOF
	chmod 600 "$ENV_FILE"
	echo "Wrote ${ENV_FILE}"
}

load_env_file() {
	if [ ! -f "$ENV_FILE" ]; then
		if [ -t 0 ]; then
			write_env_file
		else
			echo "Missing ${ENV_FILE}. Run scripts/wish-local.sh setup first." >&2
			exit 1
		fi
	fi

	# shellcheck disable=SC1090
	source "$ENV_FILE"
	export WORKER_BASE_URL EXTERNAL_API_KEY BOT_TOKEN CHAT_ID TOPIC_ID WISH_VERIFY_CMD
}

require_commands() {
	local missing=0
	for cmd in curl jq codex git; do
		if ! command -v "$cmd" >/dev/null 2>&1; then
			echo "Missing required command: ${cmd}" >&2
			missing=1
		fi
	done
	if [ "$missing" -ne 0 ]; then
		exit 1
	fi
}

install_cron() {
	load_env_file
	mkdir -p "$LOG_DIR"

	local digest_cmd="*/10 * * * * cd ${ROOT_DIR} && ${ROOT_DIR}/scripts/wish-local.sh digest >> ${LOG_DIR}/digest.log 2>&1"
	local execute_cmd="*/5 * * * * cd ${ROOT_DIR} && ${ROOT_DIR}/scripts/wish-local.sh execute >> ${LOG_DIR}/execute.log 2>&1"
	local shell_cmd="SHELL=/bin/bash"
	local path_cmd="PATH=${DEFAULT_PATH}"
	local tmp
	tmp="$(mktemp)"

	crontab -l 2>/dev/null \
		| grep -v '^SHELL=/bin/bash$' \
		| grep -v "^PATH=${DEFAULT_PATH}$" \
		| grep -v "${ROOT_DIR}/scripts/wish-local.sh digest" \
		| grep -v "${ROOT_DIR}/scripts/wish-local.sh execute" \
		> "$tmp" || true
	printf '%s\n%s\n%s\n%s\n' "$shell_cmd" "$path_cmd" "$digest_cmd" "$execute_cmd" >> "$tmp"
	crontab "$tmp"
	rm -f "$tmp"
	echo "Installed wish cron jobs:"
	echo "  ${digest_cmd}"
	echo "  ${execute_cmd}"
}

uninstall_cron() {
	local tmp
	tmp="$(mktemp)"
	crontab -l 2>/dev/null \
		| grep -v '^SHELL=/bin/bash$' \
		| grep -v "^PATH=${DEFAULT_PATH}$" \
		| grep -v "${ROOT_DIR}/scripts/wish-local.sh digest" \
		| grep -v "${ROOT_DIR}/scripts/wish-local.sh execute" \
		> "$tmp" || true
	crontab "$tmp"
	rm -f "$tmp"
	echo "Removed wish cron jobs."
}

status() {
	if [ -f "$ENV_FILE" ]; then
		echo "Config: ${ENV_FILE}"
		echo "  WORKER_BASE_URL=$(grep '^export WORKER_BASE_URL=' "$ENV_FILE" | sed 's/^export WORKER_BASE_URL=//')"
		echo "  EXTERNAL_API_KEY=SET"
		echo "  BOT_TOKEN=SET"
		echo "  CHAT_ID=$(grep '^export CHAT_ID=' "$ENV_FILE" | sed 's/^export CHAT_ID=//')"
		echo "  TOPIC_ID=$(grep '^export TOPIC_ID=' "$ENV_FILE" | sed 's/^export TOPIC_ID=//')"
	else
		echo "Config: missing (${ENV_FILE})"
	fi
	echo
	echo "Cron entries:"
	crontab -l 2>/dev/null | grep "${ROOT_DIR}/scripts/wish-local.sh" || echo "  none"
	echo
	echo "Logs:"
	echo "  ${LOG_DIR}/digest.log"
	echo "  ${LOG_DIR}/execute.log"
}

run_digest() {
	load_env_file
	require_commands
	cd "$ROOT_DIR"
	exec "${ROOT_DIR}/scripts/wish-digest.sh"
}

run_execute() {
	load_env_file
	require_commands
	cd "$ROOT_DIR"
	exec "${ROOT_DIR}/scripts/wish-execute.sh"
}

command="${1:-}"
case "$command" in
	setup)
		write_env_file
		;;
	install-cron)
		install_cron
		;;
	uninstall-cron)
		uninstall_cron
		;;
	status)
		status
		;;
	digest)
		run_digest
		;;
	execute)
		run_execute
		;;
	run-once)
		load_env_file
		require_commands
		cd "$ROOT_DIR"
		"${ROOT_DIR}/scripts/wish-digest.sh"
		"${ROOT_DIR}/scripts/wish-execute.sh"
		;;
	-h|--help|help|"")
		usage
		;;
	*)
		echo "Unknown command: ${command}" >&2
		usage >&2
		exit 1
		;;
esac
