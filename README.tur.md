# Cycling Dashcam PWA (Türkçe)

Mobil tarayıcılar için tasarlanmış, yüksek performanslı ve telemetri katmanlı bir bisiklet araç kamerası. Sürüşlerinizi gerçek zamanlı hız, GPS, eğim, kalp atış hızı ve güç ölçer verileriyle, bu verileri doğrudan video dosyasına "işleyerek" kaydedin.

## ✨ Özellikler

### Ana Ekran Arayüzü

#### Üst Kontroller
- **🔲 Fullscreen**: Uygulamayı sürükleyici bir araç kamerası görünümü için tam ekran moduna geçirir.
- **❤️ Heart Rate**: Bluetooth kalp atış hızı monitörünüzü bağlar veya bağlantısını keser.
- **⚡ Power Meter**: Bluetooth güç ölçerinizi bağlar veya bağlantısını keser.
- **⚙️ Settings**: Video kalitesi, telemetri seçenekleri ve kayıt modları için yapılandırma panelini açar.

#### Alt Kontroller
- **📸 Snapshot**: Mevcut görünümün, tüm aktif telemetri katmanları dahil olmak üzere yüksek kaliteli bir JPEG görüntüsünü yakalar.
- **🔄 Switch Camera**: Cihazınızın ön ve arka kameraları arasında geçiş yapar.

#### 🎥 Kayıt ve Loop Modu
Kayıt butonu **Loop Modu** ayarınıza bağlı olarak davranış değiştirir:

**Loop Modu Kapalı:**
- **🔴 Start Recording**: Video kaydını başlatır.
- **⏹️ Stop Recording**: Video kaydını sonlandırır.

**Loop Modu Açık:**
- **🟠 Start Loop**: Son 60 saniyenin videosunu RAM hafızada tutar ama dosyaya kaydetmez.
- **⚠️ INCIDENT**: RAM hafızadaki son 60 saniyenin videosunu dosyaya kaydeder.
- **G-Force**: Cihaz G-Force ayarında secilen degerde bir darbe algılarsa(kaza gibi) RAM hafızadaki son 60 saniyenin videosunu dosyaya kaydeder..
- **⏹️ Stop Loop**: Loop modunu sonlandırır.

---

### Uygulama Ayarları Referansı

#### 📹 Video ve Ses Yapılandırması
| Ayar | Değerler | Açıklama |
| :--- | :--- | :--- |
| **Video Orientation** | `Auto`, `Landscape`, `Portrait` | Kayıt en boy oranını kilitler. `Auto` cihazınızın fiziksel dönüşünü takip eder. |
| **Video Quality** | `4K`, `1080p`, `720p` | Çözünürlüğü ayarlar. Not: 4K, üst düzey bir cihaz ve uyumlu kamera sensörü gerektirir. |
| **Video Framerate** | `Auto`, `60`, `30`, `24` | Hedef FPS'yi ayarlar. Daha yüksek değerler daha akıcı hareket sağlar ancak dosya boyutu artar. |
| **Video Codec** | `H.264`, `H.265`, `AV1`, `VP9` | Sıkıştırma algoritmasını seçin. `H.264` en uyumlu olanıdır; `H.265` daha düşük bit hızlarında daha iyi kalite sunar. |
| **Video Bitrate** | `1 Mbps` ile `50 Mbps` arası | Veri hızını kontrol eder. `Auto` mantıklı bir varsayılan seçer. `50 Mbps` profesyonel düzenleme için "İnanılmaz" kalitedir. |
| **Audio Quality** | `Raw`, `Processed`, `Muted` | `Raw` gürültü engellemeyi devre dışı bırakır (çevresel ortamı yakalamak için daha iyidir); `Processed` sese odaklanır. |
| **Audio Bitrate** | `64 kbps` ile `320 kbps` arası | Daha yüksek değerler daha fazla ses detayını korur. `Auto` varsayılan olarak 192 kbps'dir. |

#### 🔄 Kayıt Modları
| Ayar | Değerler | Açıklama |
| :--- | :--- | :--- |
| **Loop Mode (60s)** | `On / Off` | Aktif olduğunda, uygulama RAM'de 60 saniyelik döngüsel bir tampon tutar. "Kayıt" düğmesine basmak bu tamponu diske kaydeder. |
| **G-Sensor Detection** | `On / Off` | Döngü Modu gerektirir. Ani bir darbe algılandığında otomatik olarak bir "Kaydetme" işlemini tetikler. |
| **G-Threshold** | `1.5G` ile `10.0G` arası | Darbe algılama hassasiyeti. `1.5G` hassastır (çukurlar); `10.0G` ağır kazalar içindir. |

#### 📊 Telemetri ve HUD
| Ayar | Değerler | Açıklama |
| :--- | :--- | :--- |
| **Units (MPH)** | `On / Off` | İngiliz (MPH) ve Metrik (KM/H) birimleri arasında geçiş yapar. |
| **Speed** | `On / Off` | Katmanda mevcut hızı gösterir. |
| **Grade** | `On / Off` | Mevcut eğim/iniş yüzdesini gösterir (düzleştirilmiş 3 değerli ortalama). |
| **GPS** | `On / Off` | Enlem/Boylam koordinatlarını gösterir. |
| **Heart Rate** | `On / Off` | BPM ve Maksimum HR yüzdesini gösterir (Bluetooth sensörü gerektirir). |
| **Power Meter** | `On / Off` | Watt ve FTP yüzdesini gösterir (Bluetooth sensörü gerektirir). |
| **Timestamp** | `On / Off` | Gerçek zamanlı saat ve tarihi gösterir. |
| **Max Heart Rate** | `Sayı` | Katmandaki HR yüzdesini hesaplamak için kullanılır. |
| **FTP** | `Sayı` | Fonksiyonel Eşik Gücü. Güç yüzdesini hesaplamak için kullanılır. |

---

## 🛠 Neden PWA?

Bir **Progressive Web App (PWA)**'yı yerel bir Android/iOS uygulamasına tercih etmemizin birkaç temel nedeni var:

1. **Sıfır Kurulum**: App Store veya Play Store indirmesi gerekmez. Güncellemeler aninda yuklenir.
2. **"Overlay" Zorluğu**: Yerel Android geliştirmede, video dosyasına gerçek zamanlı telemetri verilerini (GPS ve Bluetooth verileri gibi) işlemek oldukça zordur. Çeşitli telefon üreticilerinde farklı davranan karmaşık MediaCodec yapılandırmaları veya OpenGL ES katmanları gerektirir.
3. **Canvas Recording**: Web'in **Canvas API** ve **MediaRecorder** özelliklerini kullanarak, yüksek kaliteli grafikleri ve video karelerini piksel mükemmelliğinde birleştirebiliriz. Bu, ekranda gördüğünüzün, cihaz donanımından bağımsız olarak video dosyasına kaydedilenle tam olarak aynı olmasını sağlar.

---

## 📲 Kurulum (Chrome Mobil)

En iyi deneyimi (tam ekran, adres çubuğu yok, çevrimdışı destek) elde etmek için uygulamayı bir PWA olarak yükleyin:

1. Android cihazınızda **Chrome**'u açın.
2. [Public URL](https://ais-pre-sudvw57uzwst36kzco752i-116531999529.europe-west1.run.app) adresine gidin.
3. Sağ üst köşedeki **üç noktaya (⋮)** dokunun.
4. **"Ana ekrana ekle"** seçeneğinden **"Kur"** seçeneğini seçin.
5. Uygulamayı ana ekran simgenizden başlatın.

---

## 🔗 Otomatik Yeniden Bağlanma (Bluetooth)

Chrome'un varsayılan güvenlik modeli, her Bluetooth bağlantısı için manuel bir cihaz seçici gerektirir. HR ve Güç sensörleriniz için **Auto-Reconnect** özelliğini etkinleştirmek için:

1. Chrome'da yeni bir sekme açın ve şu adrese gidin: `chrome://flags`
2. **"Web Bluetooth"** araması yapın.
3. **"Web Bluetooth"** ve **"Experimental Web Platform features"** seçeneklerini etkinleştirin.
4. (İsteğe bağlı) Varsa **"Use the new permissions backend for Web Bluetooth"** seçeneğini etkinleştirin.
5. Chrome'u yeniden başlatın.

*Not: Cihazı uygulamadaki Bluetooth simgesi aracılığıyla bir kez eşleştirmeniz gerekir. Bundan sonra uygulama, başlangıçta bilinen sensörlere sessizce yeniden bağlanmaya çalışacaktır.*

---

**Güvenli sürüşler!** 🚴‍♂️💨
