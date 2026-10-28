# KẾT QUẢ Codex lane MCP — 28/10/2026 Mythos

Đã hoàn thành đúng 5 mục trong `BRIEF-CODEX-MYTHOS-MCP.md`:

1. Thêm `remote?: boolean` vào `createServer(options)` và truyền cờ xuống `registerComputeTools`. Đã rà `src/*.ts`: nhóm compute là nơi duy nhất nhận `local_dir` trực tiếp từ input tool; template/MONA Pay chỉ đọc path cấu hình do server kiểm soát, slug template đã bị giới hạn.
2. Với `remote: true`, không đăng ký `cloud_app_detect`/`vibecloud_app_detect`; `cloud_app_create`/alias không có `local_dir` và bắt buộc `repo_url`; `cloud_app_deploy`/alias không có `local_dir`. Mô tả hai tool remote ghi rõ chỉ deploy từ git và hướng người dùng sang MCP local (`npx`) để upload thư mục. Chế độ local giữ nguyên schema/hành vi cũ.
3. Env của phiên remote được dựng bằng whitelist tường minh các biến cấu hình mà `src/config.ts` đọc, cộng `MONACLOUD_TOKEN` và `MONACLOUD_CONFIG_DIR`. Không spread `process.env`; không truyền `MONA_PASS_INITIAL_ACCESS_TOKEN` hay credential tiến trình ngoài whitelist. `createServer` của phiên luôn nhận `remote: true`.
4. Đổi Express `trust proxy` thành `"loopback, uniquelocal"` để nhận đúng IP khách qua nginx/cầu Docker private.
5. Thêm test hồi quy cho tool/schema remote và local, alias tương thích, mô tả remote, env whitelist/secret, cờ `remote`, config dir tách theo user và cấu hình trust proxy.

## File thay đổi

- `src/server.ts`
- `src/compute.ts`
- `src/remote.ts`
- `test/remote.test.mjs`
- `test/remote-tools.test.mjs` (mới)
- `handoff/KET-QUA-mcp.md` (file này)

## Kiểm tra

- `git diff --check`: đạt.
- `npm test`: đạt, build TypeScript thành công; 102 test pass, 0 fail, 0 skip.
- Workspace ban đầu chưa có `node_modules`, đã chạy `npm ci` theo `package-lock.json`; không đổi dependency hoặc lockfile.
- Test remote hiện có vẫn in cảnh báo `ERR_ERL_UNDEFINED_IP_ADDRESS` từ HTTP socket giả của test harness khi thử `/register`, nhưng suite đạt và đây không phải lỗi assertion/runtime production.

Không commit, không push, không deploy.
