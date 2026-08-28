import sys

# 4-3: tum turlar onceki oturumda uygulanmis (security, data integrity, service quality, UI)
path_4_3 = "_bmad-output/implementation-artifacts/4-3-finans-claim-mekanizmas\u0131.md"

with open(path_4_3, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

for i in range(1, 13):
    old = f"Code Review Findings \ufffd Tur {i} (2026-03-22) -> Duzeltilmesi Bekleniyor"
    new = f"Code Review Findings \u2014 Tur {i} (2026-03-22) \u2192 \u2705 Uyguland\u0131 (2026-03-24)"
    content = content.replace(old, new)

with open(path_4_3, "w", encoding="utf-8") as f:
    f.write(content)
sys.stderr.buffer.write(b"4-3 OK\n")

# 4-4
path_4_4 = "_bmad-output/implementation-artifacts/4-4-i\u015flem-onay-red-ve-yorum.md"

with open(path_4_4, "r", encoding="utf-8", errors="replace") as f:
    content_4_4 = f.read()

old_4_4 = "Code Review Findings \u2014 Tur 1 (2026-03-22) \u2192 D\u00fczeltilmesi Bekleniyor"
new_4_4 = "Code Review Findings \u2014 Tur 1 (2026-03-22) \u2192 K\u0131smen Uyguland\u0131 (2026-03-24)\n\n> [UYGULANDI] requireStrictFinans eklendi \u2014 super_admin claim/approve/reject yapam\u0131yor\n> [UYGULANDI] approve/reject WHERE'e claimedBy + claimExpiresAt>NOW() atomik guard\n> [ERTELENDI] Callback enqueue g\u00fcvenilirli\u011fi, transaction_comments FK, test kapsam\u0131 genisletme"

if old_4_4 in content_4_4:
    content_4_4 = content_4_4.replace(old_4_4, new_4_4, 1)
    with open(path_4_4, "w", encoding="utf-8") as f:
        f.write(content_4_4)
    sys.stderr.buffer.write(b"4-4 OK\n")
else:
    sys.stderr.buffer.write(b"4-4 NOT FOUND\n")
