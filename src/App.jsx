import React, { useState, useEffect } from "react";

// ============================================================
// 1. DỮ LIỆU CỐ ĐỊNH (nằm ngoài component, không thay đổi)
// ============================================================

const CITIES = [
  { id: "hanoi", name: "Hà Nội", lat: 21.0285, lon: 105.8542 },
  { id: "haiphong", name: "Hải Phòng", lat: 20.8449, lon: 106.6881 },
  { id: "hue", name: "Huế", lat: 16.4637, lon: 107.5909 },
  { id: "danang", name: "Đà Nẵng", lat: 16.0544, lon: 108.2022 },
  { id: "nhatrang", name: "Nha Trang", lat: 12.2388, lon: 109.1967 },
  { id: "dalat", name: "Đà Lạt", lat: 11.9404, lon: 108.4583 },
  { id: "hcm", name: "TP. Hồ Chí Minh", lat: 10.8231, lon: 106.6297 },
  { id: "cantho", name: "Cần Thơ", lat: 10.0452, lon: 105.7469 },
];

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

// Chuyển mã thời tiết thành biểu tượng + mô tả + nhóm (nhóm dùng để đổi màu nền)
function getWeatherInfo(code) {
  if (code === 0) return { icon: "☀️", text: "Trời quang", group: "sunny" };
  if (code === 1) return { icon: "🌤️", text: "Gần như quang đãng", group: "sunny" };
  if (code === 2) return { icon: "⛅", text: "Có mây rải rác", group: "cloudy" };
  if (code === 3) return { icon: "☁️", text: "Nhiều mây", group: "cloudy" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "Sương mù", group: "cloudy" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Mưa phùn", group: "rain" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", text: "Mưa", group: "rain" };
  if (code >= 71 && code <= 77) return { icon: "❄️", text: "Tuyết", group: "cloudy" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", text: "Mưa rào", group: "rain" };
  if (code >= 95) return { icon: "⛈️", text: "Dông", group: "storm" };
  return { icon: "🌡️", text: "Không rõ", group: "cloudy" };
}

// ============================================================
// 2. CÁC HÀM TIỆN ÍCH NHỎ
// ============================================================

// Đổi °C sang °F rồi làm tròn. Dữ liệu gốc luôn giữ ở °C.
function formatTemp(celsius, unit) {
  if (unit === "F") {
    return Math.round((celsius * 9) / 5 + 32) + "°F";
  }
  return Math.round(celsius) + "°C";
}

// Bỏ dấu tiếng Việt để tìm kiếm: "Đà Nẵng" -> "da nang"
function removeAccents(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// "2026-10-15" -> { weekday: "Thứ năm", date: "15/10" }
// Tách chuỗi bằng tay để không bị lệch múi giờ.
function formatDay(dateString) {
  const parts = dateString.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const d = new Date(year, month - 1, day);
  return { weekday: WEEKDAYS[d.getDay()], date: day + "/" + month };
}

// "2026-10-15T14:30" -> "14:30 ngày 15/10/2026"
function formatUpdateTime(timeString) {
  const parts = timeString.split("T");
  const dateParts = parts[0].split("-");
  return parts[1] + " ngày " + dateParts[2] + "/" + dateParts[1] + "/" + dateParts[0];
}

// Đọc / ghi localStorage. Bọc try-catch phòng khi trình duyệt không cho dùng.
function loadSaved(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Không lưu được thì bỏ qua, ứng dụng vẫn chạy bình thường
  }
}

// ============================================================
// 3. COMPONENT CHÍNH
// ============================================================

export default function WeatherApp() {
  // --- State: dữ liệu thay đổi theo thời gian ---
  const [selectedId, setSelectedId] = useState(null); // thành phố đang chọn
  const [weather, setWeather] = useState(null); // dữ liệu từ API
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0); // tăng lên để gọi lại API
  const [unit, setUnit] = useState("C"); // "C" hoặc "F"

  // Cá nhân hóa
  const [userName, setUserName] = useState(() => loadSaved("weather-name", ""));
  const [favorites, setFavorites] = useState(() => loadSaved("weather-favorites", []));
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [search, setSearch] = useState("");

  // Thành phố đang chọn (tìm trong mảng CITIES theo id)
  const selectedCity = CITIES.find((c) => c.id === selectedId);

  // --- Gọi API mỗi khi đổi thành phố hoặc bấm "Thử lại" ---
  useEffect(() => {
    if (!selectedCity) return;

    let cancelled = false; // đánh dấu: kết quả này còn cần dùng không?

    setLoading(true);
    setError("");
    setWeather(null);

    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + selectedCity.lat +
      "&longitude=" + selectedCity.lon +
      "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=Asia%2FHo_Chi_Minh&forecast_days=7";

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Máy chủ trả về lỗi " + response.status);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return; // người dùng đã chọn thành phố khác, bỏ kết quả cũ
        setWeather(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Không tải được dữ liệu. Hãy kiểm tra kết nối mạng rồi thử lại.");
        setLoading(false);
      });

    // Hàm dọn dẹp: chạy khi selectedId đổi trước khi effect chạy lại
    return () => {
      cancelled = true;
    };
  }, [selectedId, retryCount]);

  // --- Các hàm xử lý sự kiện ---
  function handleNameChange(event) {
    const name = event.target.value;
    setUserName(name);
    save("weather-name", name);
  }

  function toggleFavorite(cityId) {
    let newList;
    if (favorites.includes(cityId)) {
      newList = favorites.filter((id) => id !== cityId); // bỏ yêu thích
    } else {
      newList = [...favorites, cityId]; // thêm yêu thích
    }
    setFavorites(newList);
    save("weather-favorites", newList);
  }

  // --- Lọc danh sách thành phố theo ô tìm kiếm và nút "Chỉ yêu thích" ---
  const visibleCities = CITIES.filter((city) => {
    const matchSearch = removeAccents(city.name).includes(removeAccents(search));
    const matchFavorite = onlyFavorites ? favorites.includes(city.id) : true;
    return matchSearch && matchFavorite;
  });

  // Nhóm thời tiết hiện tại để chọn màu nền
  let group = "idle";
  if (weather) group = getWeatherInfo(weather.current.weather_code).group;

  // ==========================================================
  // 4. GIAO DIỆN (JSX)
  // ==========================================================
  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="header">
        <div>
          <h1 className="title">
            {userName ? "Chào " + userName + "," : "Chào bạn,"} hôm nay trời thế nào?
          </h1>
          <p className="subtitle">Chọn một thành phố để xem thời tiết và dự báo 7 ngày.</p>
        </div>

        <div className="header-tools">
          <label className="field">
            <span>Tên của bạn</span>
            <input
              type="text"
              value={userName}
              onChange={handleNameChange}
              placeholder="Ví dụ: Lan"
              maxLength={20}
            />
          </label>

          <div className="unit-switch" role="group" aria-label="Đơn vị nhiệt độ">
            <button
              className={unit === "C" ? "unit-btn active" : "unit-btn"}
              onClick={() => setUnit("C")}
            >
              °C
            </button>
            <button
              className={unit === "F" ? "unit-btn active" : "unit-btn"}
              onClick={() => setUnit("F")}
            >
              °F
            </button>
          </div>
        </div>
      </header>

      <main className="layout">
        {/* ---------- Cột trái: danh sách thành phố ---------- */}
        <aside className="sidebar">
          <input
            className="search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm thành phố (không cần gõ dấu)"
            aria-label="Tìm thành phố"
          />

          <label className="check">
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
            />
            Chỉ hiện thành phố yêu thích
          </label>

          {visibleCities.length === 0 && (
            <p className="empty-list">
              {onlyFavorites && search === ""
                ? "Bạn chưa đánh dấu thành phố nào. Bấm ngôi sao ở cạnh tên để thêm."
                : "Không tìm thấy thành phố phù hợp."}
            </p>
          )}

          <ul className="city-list">
            {visibleCities.map((city) => {
              const isSelected = city.id === selectedId;
              const isFavorite = favorites.includes(city.id);
              return (
                <li key={city.id} className={isSelected ? "city-row selected" : "city-row"}>
                  <button className="city-btn" onClick={() => setSelectedId(city.id)}>
                    {city.name}
                  </button>
                  <button
                    className={isFavorite ? "star on" : "star"}
                    onClick={() => toggleFavorite(city.id)}
                    aria-label={(isFavorite ? "Bỏ yêu thích " : "Yêu thích ") + city.name}
                  >
                    {isFavorite ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ---------- Cột phải: thời tiết ---------- */}
        <section className={"panel panel-" + group}>
          {/* Trạng thái 1: chưa chọn */}
          {!selectedCity && (
            <div className="message">
              <div className="big-icon">🧭</div>
              <h2>Chưa chọn thành phố</h2>
              <p>Bấm vào một thành phố ở danh sách để xem thời tiết.</p>
            </div>
          )}

          {/* Trạng thái 2: đang tải */}
          {selectedCity && loading && (
            <div className="message">
              <div className="big-icon">⏳</div>
              <h2>Đang tải thời tiết {selectedCity.name}...</h2>
            </div>
          )}

          {/* Trạng thái 3: lỗi */}
          {selectedCity && error !== "" && (
            <div className="message">
              <div className="big-icon">⚠️</div>
              <h2>Có lỗi xảy ra</h2>
              <p>{error}</p>
              <button className="retry" onClick={() => setRetryCount(retryCount + 1)}>
                Thử lại
              </button>
            </div>
          )}

          {/* Trạng thái 4: có dữ liệu */}
          {selectedCity && weather && !loading && error === "" && (
            <WeatherDetail city={selectedCity} weather={weather} unit={unit} />
          )}
        </section>
      </main>
    </div>
  );
}

// ============================================================
// 5. COMPONENT CON: hiển thị thời tiết hiện tại + 7 ngày
// Nhận dữ liệu qua props (city, weather, unit)
// ============================================================

function WeatherDetail({ city, weather, unit }) {
  const current = weather.current;
  const daily = weather.daily;
  const info = getWeatherInfo(current.weather_code);

  return (
    <div>
      <h2 className="city-name">{city.name}</h2>

      <div className="now">
        <div className="now-icon">{info.icon}</div>
        <div>
          <div className="now-temp">{formatTemp(current.temperature_2m, unit)}</div>
          <div className="now-text">{info.text}</div>
        </div>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="fact-label">Độ ẩm</span>
          <strong>{current.relative_humidity_2m}%</strong>
        </div>
        <div className="fact">
          <span className="fact-label">Sức gió</span>
          <strong>{current.wind_speed_10m} km/h</strong>
        </div>
        <div className="fact">
          <span className="fact-label">Cập nhật lúc</span>
          <strong>{formatUpdateTime(current.time)}</strong>
        </div>
      </div>

      <h3 className="forecast-title">Dự báo 7 ngày</h3>
      <ul className="forecast">
        {daily.time.map((dateString, i) => {
          const day = formatDay(dateString);
          const dayInfo = getWeatherInfo(daily.weather_code[i]);
          return (
            <li key={dateString} className="day">
              <div className="day-name">{day.weekday}</div>
              <div className="day-date">{day.date}</div>
              <div className="day-icon" title={dayInfo.text}>
                {dayInfo.icon}
              </div>
              <div className="day-max">{formatTemp(daily.temperature_2m_max[i], unit)}</div>
              <div className="day-min">{formatTemp(daily.temperature_2m_min[i], unit)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// 6. CSS (đặt trong chuỗi để cả ứng dụng nằm trong 1 file)
// ============================================================

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800&display=swap');

.app {
  --mint: #e4f6ee;
  --leaf: #17a673;
  --leaf-dark: #0c6b4a;
  --sky: #d6f0fb;
  --ink: #12403a;
  --muted: #4f7a72;
  --white: #ffffff;
  --line: #bfe3d4;
  font-family: 'Be Vietnam Pro', system-ui, sans-serif;
  color: var(--ink);
  background: var(--mint);
  min-height: 100vh;
  padding: 20px 16px 40px;
  box-sizing: border-box;
}
.app *, .app *::before, .app *::after { box-sizing: border-box; }
.app button, .app input { font-family: inherit; font-size: 1rem; color: inherit; }
.app button:focus-visible, .app input:focus-visible { outline: 3px solid #0e8fc4; outline-offset: 2px; }

.header { max-width: 1000px; margin: 0 auto 20px; display: flex; flex-direction: column; gap: 16px; }
.title { font-size: 1.6rem; font-weight: 800; margin: 0 0 4px; line-height: 1.25; }
.subtitle { margin: 0; color: var(--muted); }
.header-tools { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }

.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.875rem; color: var(--muted); }
.field input { padding: 8px 12px; border: 2px solid var(--line); border-radius: 10px; background: var(--white); width: 180px; }

.unit-switch { display: flex; border: 2px solid var(--leaf); border-radius: 10px; overflow: hidden; }
.unit-btn { padding: 8px 18px; border: none; background: var(--white); cursor: pointer; font-weight: 700; }
.unit-btn.active { background: var(--leaf); color: var(--white); }

.layout { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

.sidebar { background: var(--white); border-radius: 16px; padding: 16px; border: 2px solid var(--line); }
.search { width: 100%; padding: 10px 12px; border: 2px solid var(--line); border-radius: 10px; margin-bottom: 10px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--muted); margin-bottom: 12px; cursor: pointer; }
.check input { width: 18px; height: 18px; accent-color: var(--leaf); }
.empty-list { color: var(--muted); font-size: 0.9rem; margin: 8px 0; }

.city-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.city-row { display: flex; align-items: center; border-radius: 10px; border: 2px solid transparent; }
.city-row.selected { background: var(--leaf); }
.city-row.selected .city-btn { color: var(--white); font-weight: 700; }
.city-row.selected .star { color: var(--white); }
.city-btn { flex: 1; text-align: left; padding: 10px 12px; background: none; border: none; cursor: pointer; border-radius: 10px; }
.city-row:not(.selected) .city-btn:hover { background: var(--mint); }
.star { background: none; border: none; cursor: pointer; font-size: 1.3rem; padding: 6px 10px; color: var(--muted); }
.star.on { color: #e8a20c; }
.city-row.selected .star.on { color: #ffe27a; }

.panel { border-radius: 16px; padding: 20px; min-height: 320px; border: 2px solid var(--line); background: var(--white); }
.panel-sunny { background: #fff3c4; border-color: #f2dc82; }
.panel-cloudy { background: #e3eef2; border-color: #c4d9e0; }
.panel-rain { background: #cfe8f7; border-color: #a6d0ea; }
.panel-storm { background: #d9d4ee; border-color: #b9b0de; }

.message { text-align: center; padding: 40px 12px; }
.message h2 { margin: 8px 0; font-size: 1.25rem; }
.message p { color: var(--muted); margin: 0 0 16px; }
.big-icon { font-size: 3rem; }
.retry { padding: 10px 24px; border: none; border-radius: 10px; background: var(--leaf-dark); color: var(--white); font-weight: 700; cursor: pointer; }

.city-name { margin: 0 0 12px; font-size: 1.4rem; }
.now { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.now-icon { font-size: 4.5rem; line-height: 1; }
.now-temp { font-size: 3rem; font-weight: 800; line-height: 1; }
.now-text { font-size: 1.1rem; margin-top: 4px; }

.facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
.fact { background: rgba(255, 255, 255, 0.75); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.fact-label { font-size: 0.8rem; color: var(--muted); }
.fact strong { font-size: 0.95rem; }

.forecast-title { margin: 0 0 10px; font-size: 1.05rem; }
.forecast { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.day { background: rgba(255, 255, 255, 0.75); border-radius: 12px; padding: 10px 4px; text-align: center; }
.day-name { font-weight: 700; font-size: 0.8rem; }
.day-date { font-size: 0.75rem; color: var(--muted); }
.day-icon { font-size: 1.6rem; margin: 6px 0; }
.day-max { font-weight: 700; font-size: 0.9rem; }
.day-min { font-size: 0.85rem; color: var(--muted); }

/* Màn hình nhỏ hơn 768px: dự báo chuyển thành danh sách dọc */
@media (max-width: 767px) {
  .facts { grid-template-columns: 1fr; }
  .forecast { grid-template-columns: 1fr; }
  .day { display: grid; grid-template-columns: 1fr 40px 60px 60px; align-items: center; text-align: left; padding: 8px 12px; gap: 8px; }
  .day-name, .day-date { grid-column: 1; }
  .day-icon { grid-column: 2; grid-row: 1 / span 2; margin: 0; text-align: center; }
  .day-max { grid-column: 3; grid-row: 1 / span 2; text-align: right; }
  .day-min { grid-column: 4; grid-row: 1 / span 2; text-align: right; }
}

/* Từ 768px trở lên: chia 2 cột */
@media (min-width: 768px) {
  .app { padding: 32px 24px 48px; }
  .header { flex-direction: row; justify-content: space-between; align-items: flex-end; }
  .title { font-size: 2rem; }
  .layout { flex-direction: row; align-items: flex-start; }
  .sidebar { width: 300px; flex-shrink: 0; }
  .panel { flex: 1; min-width: 0; }
}
`;