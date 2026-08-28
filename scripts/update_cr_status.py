import re, sys

UPDATES = [
    # (filepath, pattern, replacement, note_lines)
    (
        "_bmad-output/implementation-artifacts/6-3-audit-log-ekranı-export.md",
        r"(Code Review Findings.+Tur 1.+?)Sonradan Uygulanacak",
        r"\1✅ Uygulandı (2026-03-24)",
        [],
    ),
    (
        "_bmad-output/implementation-artifacts/5-2-deposit-withdrawal-api.md",
        r"(Code Review Findings.+Tur 1.+?)Sonradan Uygulanacak",
        r"\1Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] claim-timeout.ts type=deposit filtresi eklendi",
            "> [ERTELENDI] boss.send güvenilirlik — mimari değişiklik gerekiyor",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/5-3-işlem-sorgulama-ödeme-yöntemleri-kur-api.md",
        r"(Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] dateFrom/dateTo datetime validation eklendi",
            "> [UYGULANDI] listTransactions sort stability (createdAt, id) eklendi",
            "> [ERTELENDI] Service davranış testleri — düşük öncelik",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/5-4-callback-gönderim-retry-sistemi.md",
        r"(Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] Payload'a signature alanı eklendi",
            "> [UYGULANDI] SSRF koruması (https-only, private IP blacklist)",
            "> [UYGULANDI] merchant.status != active → callback atlandı",
            "> [ERTELENDI] callbackRetry idempotency — mimari değişiklik",
            "> [ERTELENDI] Callback enqueue transactional outbox — mimari değişiklik",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/5-5-callback-yönetimi-sandbox.md",
        r"(Code Review Findings - Tur 1 \(2026-03-23\)) -> Sonradan Uygulanacak",
        r"\1 -> Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] simulateCallback atomik attemptNumber (SQL subquery)",
            "> [ERTELENDI] Retry kapsam intent_gap — spec değişikliği gerekiyor",
            "> [ERTELENDI] UI hata durumu, polling — düşük öncelik",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/6-1-oyuncu-engelleme.md",
        r"(Code Review Findings - Tur 1 \(2026-03-23\)) -> Sonradan Uygulanacak",
        r"\1 -> Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] Status filtresi SQL'e taşındı; ayrı count ile total düzeltildi",
            "> [ERTELENDI] TOCTOU block kontrolü — mimari değişiklik",
            "> [ERTELENDI] Duplicate aktif engel unique constraint — DB migration",
            "> [ERTELENDI] Performans indeksi — DB migration",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/6-2-uyarı-kuralları-motoru.md",
        r"(Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] evaluateRules catch bloklarına structured error log eklendi",
            "> [UYGULANACAK] createRule merchant tenant sahiplik doğrulaması",
            "> [ERTELENDI] parseFloat → decimal — düşük öncelik",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/7-1-exchange-rate-yönetimi-senkronizasyon.md",
        r"(Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] Bildirim insert try/catch ile sarıldı; hata loglama eklendi",
            "> [UYGULANACAK] Stale kontrolü currency pair bazlı",
            "> [ERTELENDI] CoinGecko EUR/TRY fallback — mimari kapsam değişikliği",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/7-2-işlem-raporları.md",
        r"(Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] Yetkisiz rol whitelist eklendi (merchant/firma/super_admin)",
            "> [UYGULANACAK] currency alanı spec uyumu",
            "> [UYGULANACAK] avgDurationMs REJECTED dahil hesap düzeltilecek",
            "> [ERTELENDI] Frontend grafik intent_gap — spec değişikliği",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/7-3-csvexcel-export-kur-gecmisi.md",
        r"(## Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] meta.total bug düzeltildi (ayrı count sorgusu)",
            "> [UYGULANDI] Download'da dosya varlık kontrolü eklendi (fs.existsSync)",
            "> [ERTELENDI] Streaming/OOM riski — mimari değişiklik",
            "> [ERTELENDI] Expired file cleanup cron — yeni iş",
        ],
    ),
    (
        "_bmad-output/implementation-artifacts/7-4-sistem-konfigurasyonu.md",
        r"(## Code Review Findings — Tur 1 \(2026-03-23\)) → Sonradan Uygulanacak",
        r"\1 → Kısmen Uygulandı (2026-03-24)",
        [
            "> [UYGULANDI] Audit log: request.auditEntry her iki PUT route'a eklendi (CR-1)",
            "> [UYGULANDI] INVALID_TIMEOUT hata kodu route'da manuel range kontrolü ile eklendi (CR-2)",
            "> [UYGULANDI] Atomic upsert: onConflictDoUpdate ile race condition giderildi (CR-3)",
            "> [ERTELENDI] FK constraint updatedBy→users — DB migration",
            "> [ERTELENDI] Silent fallback loglama, frontend form state — düşük öncelik",
        ],
    ),
]

for filepath, pattern, replacement, notes in UPDATES:
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        new_content = re.sub(pattern, replacement, content, count=1)
        changed = new_content != content

        if changed and notes:
            note_block = "\n" + "\n".join(notes) + "\n"
            # insert after the heading line
            repl_text = re.search(pattern, content)
            if repl_text:
                heading_end = repl_text.end()
                new_content = new_content[:new_content.index(re.sub(pattern, replacement, repl_text.group(0))) + len(re.sub(pattern, replacement, repl_text.group(0)))] + note_block + new_content[new_content.index(re.sub(pattern, replacement, repl_text.group(0))) + len(re.sub(pattern, replacement, repl_text.group(0))):]

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"{'OK' if changed else 'NO-CHANGE'}: {filepath}")
    except Exception as e:
        print(f"FAIL: {filepath} -> {e}", file=sys.stderr)
