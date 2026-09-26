# STATUS C — MCP chia sẻ doanh thu

Hoàn thành theo `BRIEF-C-MCP.md` ngày 26/09/2026.

## Đã làm

- Thêm 3 tool `cloud_affiliate_link`, `cloud_affiliate_stats`, `cloud_affiliate_claim` và 3 alias `vibecloud_*`.
- Gọi đúng contract compute qua `clients.vibecloud`: hồ sơ/link, danh sách commission có lọc và nhận mã giới thiệu.
- Thêm schema strict, metadata đầy đủ; link/stats read-only, claim không destructive.
- Thêm hướng dẫn disclosure và không tự đăng link khi người dùng chưa duyệt.
- Cập nhật tài liệu, changelog và version package lên `0.11.0`.

## File sửa/tạo

- `src/affiliate.ts` (mới)
- `src/server.ts`
- `src/monapay.ts`
- `test/affiliate.test.mjs` (mới)
- `README.md`
- `docs/ai-agent.md`
- `CHANGELOG.md`
- `package.json`
- `handoff/affiliate/STATUS-C.md` (mới)

`server.json` và `glama.json` không liệt kê tool nên không sửa.

## Kiểm tra

- `npm run build`: PASS.
- Test mới + annotations: 5/5 PASS.
- `npm test`: 99/100 PASS. Test duy nhất lỗi là `test/stdio.test.mjs` vì `support/stdio-check.mjs` đang khóa tổng tool cũ ở `180`; sau 3 tool + 3 alias, tổng đúng là `186`. `support/stdio-check.mjs` không thuộc danh sách file được phép sửa nên giữ nguyên.
- `git diff --check`: PASS.

Không publish npm, không commit.
