import sys, os

files = [
    (
        "_bmad-output/implementation-artifacts/2-3-kullan\u0131c\u0131-engelleme.md",
        "Code Review Findings - Tur 2 (2026-03-21) -> Duzeltilmesi Bekleniyor",
        "Code Review Findings - Tur 2 (2026-03-21) -> K\u0131smen Uyguland\u0131 (2026-03-24)\n\n> [UYGULANDI] blockUser update returning() ile etkilenen sat\u0131r kontrol\u00fc eklendi\n> [ERTELENDI] Masquerade block kontrol\u00fc \u2014 pre-existing policy",
    ),
    (
        "_bmad-output/implementation-artifacts/2-3-kullan\u0131c\u0131-engelleme.md",
        "Code Review Findings - Tur 3 (2026-03-21) -> Duzeltilmesi Bekleniyor",
        "Code Review Findings - Tur 3 (2026-03-21) -> \u00d6nceden Uyguland\u0131 (onceki oturum)\n\n> [UYGULANDI] 2FA verify i\u00e7inde block/status/tenant FOR UPDATE ile yeniden do\u011frulan\u0131yor\n> [UYGULANDI] Login guard s\u0131ralamas\u0131 \u2014 block kontrol\u00fc inactive\u2019den \u00f6nce\n> [UYGULANDI] blockUser policy transaction i\u00e7inde yeniden do\u011frulan\u0131yor",
    ),
]

for path, old, new in files:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    if old in content:
        content = content.replace(old, new, 1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        sys.stderr.buffer.write(b"OK\n")
    else:
        sys.stderr.buffer.write(b"NOT FOUND\n")
