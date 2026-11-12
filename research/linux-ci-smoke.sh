set -euo pipefail
source_root="$(cd "$(dirname "$0")/.." && pwd)"
test_root="$(mktemp -d /var/tmp/agentterminal-linux-ci-XXXXXX)"
printf 'Linux verification directory: %s\n' "$test_root"
mkdir -p "$test_root/project" "$test_root/tools" "$test_root/tmp"
export TMPDIR="$test_root/tmp"
git -C "$source_root" ls-files -co --exclude-standard -z | tar -C "$source_root" --null -T - -cf - | tar -C "$test_root/project" -xf -
curl --fail --silent --show-error --location https://nodejs.org/dist/v22.17.0/node-v22.17.0-linux-x64.tar.xz -o "$test_root/node.tar.xz"
tar -C "$test_root" -xf "$test_root/node.tar.xz"
export PATH="$test_root/node-v22.17.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
npm install --prefix "$test_root/tools" pnpm@10.33.0 --no-audit --no-fund
export PATH="$test_root/tools/node_modules/.bin:$PATH"
cd "$test_root/project"
pnpm install --frozen-lockfile
pnpm build
node research/pty-smoke.mjs
pnpm test
pnpm --dir apps/ui test
