import sys

updates = [
    (
        "_bmad-output/implementation-artifacts/6-1-oyuncu-engelleme.md",
        "> [ERTELENDI] Duplicate aktif engel unique constraint \u2014 DB migration\n> [ERTELENDI] Performans indeksi \u2014 DB migration",
        "> [UYGULANDI] blockPlayer idempotent: insert \u00f6ncesi ayn\u0131 merchant+player blok siliniyor\n> [UYGULANDI] Performance index (merchant_id, external_user_id) \u2014 migration 0021\n> [UYGULANDI] Tenant+createdAt listeleme indeksi \u2014 migration 0021",
    ),
    (
        "_bmad-output/implementation-artifacts/7-4-sistem-konfigurasyonu.md",
        "> [ERTELENDI] FK constraint updatedBy\u2192users \u2014 DB migration\n> [ERTELENDI] Silent fallback loglama, frontend form state \u2014 d\u00fc\u015f\u00fck \u00f6ncelik",
        "> [UYGULANDI] FK constraint updated_by \u2192 users.id (ON DELETE SET NULL) \u2014 migration 0021\n> [UYGULANDI] getClaimTimeoutMs / isTotpRequired catch'e console.error eklendi\n> [ERTELENDI] Frontend form state reset \u2014 d\u00fc\u015f\u00fck \u00f6ncelik",
    ),
]

for path, old, new in updates:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if old in content:
            content = content.replace(old, new, 1)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            sys.stderr.buffer.write(("OK: " + path + "\n").encode("utf-8"))
        else:
            sys.stderr.buffer.write(("NOT FOUND: " + path + "\n").encode("utf-8"))
    except Exception as e:
        sys.stderr.buffer.write(("FAIL: " + path + ": " + str(e) + "\n").encode("utf-8"))
