require("dotenv").config();
const axios = require("axios");

const OSU_API_URL = "https://osu.ppy.sh/api/v2";
const MODES = ["osu", "taiko", "fruits", "mania"];
let lastScoreId = { osu: null, taiko: null, fruits: null, mania: null };
let lastPlayerStatus = null; // Menyimpan status terakhir pemain (online/offline)

// Fungsi untuk mendapatkan token osu!
async function getOsuToken() {
    try {
        const response = await axios.post("https://osu.ppy.sh/oauth/token", {
            client_id: process.env.OSU_CLIENT_ID,
            client_secret: process.env.OSU_CLIENT_SECRET,
            grant_type: "client_credentials",
            scope: "public"
        });
        return response.data.access_token;
    } catch (error) {
        console.error("❌ [OSU] Gagal mendapatkan token osu!", error.response?.data || error.message);
        return null;
    }
}

// Fungsi untuk mengambil skor terbaru user di mode tertentu
async function fetchLatestScore(mode) {
    try {
        const token = await getOsuToken();
        if (!token) return null;

        const response = await axios.get(`${OSU_API_URL}/users/${process.env.OSU_USER_ID}/scores/recent?mode=${mode}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.length > 0) {
            const latestScore = response.data[0];

            if (latestScore.id !== lastScoreId[mode]) {
                lastScoreId[mode] = latestScore.id;
                return latestScore;
            }
        }
        return null;
    } catch (error) {
        console.error(`❌ [OSU] Gagal mengambil skor (${mode})`, error.response?.data || error.message);
        return null;
    }
}

// Fungsi untuk mengirim embed ke Discord menggunakan webhook
async function sendScoreEmbed(score, mode) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return console.error("❌ [DISCORD] Webhook URL tidak ditemukan!");

    const beatmapTitle = score.beatmap?.title || score.beatmapset?.title_unicode || score.beatmapset?.title || "Unknown Beatmap";
    const beatmapCover = score.beatmapset?.covers?.list || "https://osu.ppy.sh/favicon.ico";
    const beatmapUrl = score.beatmap?.url || `https://osu.ppy.sh/beatmaps/${score.beatmap?.id}`;

    const embed = {
        color: 0xff66aa,
        title: `🎮 ${score.user.username} memainkan ${beatmapTitle}`,
        url: beatmapUrl,
        thumbnail: {
            url: beatmapCover
        },
        fields: [
            { name: "🎯 Accuracy", value: `${(score.accuracy * 100).toFixed(2)}%`, inline: true },
            { name: "🏆 Rank", value: score.rank, inline: true },
            { name: "💯 PP", value: score.pp ? `${score.pp.toFixed(2)} pp` : "N/A", inline: true },
            { name: "💥 Max Combo", value: `${score.max_combo}x`, inline: true },
            { name: "❌ Misses", value: `${score.statistics.count_miss}`, inline: true },
            { name: "🕹 Mode", value: mode.toUpperCase(), inline: true }
        ],
        footer: {
            text: "Osu! Score Update",
            icon_url: score.user.avatar_url || "https://osu.ppy.sh/favicon.ico"
        }
    };

    if (score.ended_at) {
        const timestamp = new Date(score.ended_at);
        if (!isNaN(timestamp)) {
            embed.timestamp = timestamp.toISOString();
        }
    }

    try {
        await axios.post(webhookUrl, { embeds: [embed] });
    } catch (error) {
        console.error("❌ [DISCORD] Gagal mengirim embed ke webhook", error.response?.data || error.message);
    }
}

// Fungsi untuk mengecek skor terbaru di semua mode
async function checkScores() {
    for (const mode of MODES) {
        const score = await fetchLatestScore(mode);
        if (score) {
            await sendScoreEmbed(score, mode);
        }
    }
}

// Fungsi untuk memeriksa status online/offline player
async function checkPlayerStatus() {
    try {
        const token = await getOsuToken();
        if (!token) return;

        const response = await axios.get(`${OSU_API_URL}/users/${process.env.OSU_USER_ID}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const playerStatus = response.data.is_online ? "Online" : "Offline";

        // Kirim embed hanya jika status pemain berubah
        if (playerStatus !== lastPlayerStatus) {
            lastPlayerStatus = playerStatus;

            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            if (!webhookUrl) return console.error("❌ [DISCORD] Webhook URL tidak ditemukan!");

            const embed = {
                color: 0xff66aa,
                title: `${response.data.username} Status`,
                description: `Status Pemain: **${playerStatus}**`,
                footer: {
                    text: "Osu! Player Status",
                    icon_url: response.data.avatar_url || "https://osu.ppy.sh/favicon.ico"
                }
            };

            try {
                await axios.post(webhookUrl, { embeds: [embed] });
                console.log(`✅ Status ${response.data.username}: ${playerStatus}`);
            } catch (error) {
                console.error("❌ [DISCORD] Gagal mengirim embed ke webhook", error.response?.data || error.message);
            }
        }
    } catch (error) {
        console.error("❌ [OSU] Gagal memeriksa status pemain", error.response?.data || error.message);
    }
}

// Memulai pemantauan skor dan status pemain
setInterval(checkScores, 5000); // Memeriksa skor setiap 5 detik
setInterval(checkPlayerStatus, 10000); // Memeriksa status pemain setiap 10 detik
