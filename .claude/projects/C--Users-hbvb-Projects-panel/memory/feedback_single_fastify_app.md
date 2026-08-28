---
name: Tek Fastify uygulaması kararı
description: Panel ve merchant API ayrı servislere bölünmemeli — daha önce tartışılmış ve vazgeçilmiş karar
type: feedback
---

Panel ve merchant API'yi iki ayrı Fastify uygulamasına (`api-internal` / `api-merchant`) bölme fikri daha önce tartışılmış ve **kesinlikle reddedilmiştir**. Bu karar API call sayısını azaltma hedefiyle birlikte alınmıştır.

**Why:** Kullanıcı bu mimari ayrımı gereksiz buldu ve daha sade tek servis yaklaşımını tercih etti. API çağrı sayısı da buna göre optimize edildi.

**How to apply:** Mimari önerilerde, ADR'lerde veya herhangi bir bağlamda panel+merchant API split'ini tekrar gündeme getirme. Her zaman tek Fastify uygulaması varsay.
