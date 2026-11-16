# 🎯 Sandık Radarı

TikTok LIVE'da düşen **sandık / zarf / portal** kutularını yakalar, filtreler ve geri sayımla listeler.
Üç parça: `src/scanner.js` (dinleyici) · `web/` (statik panel) · `src/server.js` (Windows/yerel sunucu).

## Windows (localhost)
Node.js 20+ kur, sonra `windows\baslat.bat` çift tıkla. Panel `http://127.0.0.1:8800` açılır; tarayıcı aynı süreçte çalışır.
Telefondan aynı Wi-Fi'da: `node src/server.js --host=0.0.0.0` ve `http://<bilgisayar-ip>:8800`.

## GitHub (Pages + Actions)
1. Depo ayarları → Pages → Source: **GitHub Actions**.
2. (İsteğe bağlı, anlık akış) Secrets: `NTFY_TOPIC` (uzun, tahmin edilemez ad), `NTFY_KEY`; aynı değerleri `web/config.js`'e yaz.
3. `main`'e push → panel yayınlanır. Actions → **Tarayıcı** her 4 saatte ~230 dk çalışır, `data/boxes.json`'u 5 dk'da bir commit eder.

## Notlar
- **Oran = jeton ÷ kişi.** Eşikler (Yüksek oran sekmesi 1,75) ilk gerçek örneğe (21 sandık, medyan ~1,7) göre; veri biriktikçe panelden ayarla.
- Tarayıcı saatte en çok 25 bağlantı dener (TikTok kotası), ölü odaya ceza süresi uygular.
- Çanta (goody bag) olayını web istemcisi göremez; bu yüzden çanta sekmesi yok.
- Üçüncü taraf kazıma TikTok şartlarına aykırı olabilir; kendi sorumluluğunda kullan.

Test: `npm test`
