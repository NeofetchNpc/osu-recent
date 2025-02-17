require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

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

// Fungsi untuk mengirim embed ke Discord
async function sendScoreEmbed(score, mode) {
    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    if (!channel) return console.error("❌ [DISCORD] Channel tidak ditemukan!");

    const beatmapTitle = score.beatmap?.title || score.beatmapset?.title_unicode || score.beatmapset?.title || "Unknown Beatmap";
    const beatmapCover = score.beatmapset?.covers?.list || "https://osu.ppy.sh/favicon.ico";
    const beatmapUrl = score.beatmap?.url || `https://osu.ppy.sh/beatmaps/${score.beatmap?.id}`;

    const embed = new EmbedBuilder()
        .setColor("#ff66aa")
        .setTitle(`🎮 ${score.user.username} memainkan ${beatmapTitle}`)
        .setURL(beatmapUrl)
        .setThumbnail(beatmapCover)
        .addFields(
            { name: "🎯 Accuracy", value: `${(score.accuracy * 100).toFixed(2)}%`, inline: true },
            { name: "🏆 Rank", value: score.rank, inline: true },
            { name: "💯 PP", value: score.pp ? `${score.pp.toFixed(2)} pp` : "N/A", inline: true },
            { name: "💥 Max Combo", value: `${score.max_combo}x`, inline: true },
            { name: "❌ Misses", value: `${score.statistics.count_miss}`, inline: true },
            { name: "🕹 Mode", value: mode.toUpperCase(), inline: true }
        );

    // Ambil foto profil pemain dari response
    const playerProfileUrl = score.user.avatar_url || "https://osu.ppy.sh/favicon.ico";
    embed.setFooter({
        text: "Osu! Score Update",
        iconURL: playerProfileUrl // Menggunakan foto profil pemain
    });

    if (score.ended_at) {
        const timestamp = new Date(score.ended_at);
        if (!isNaN(timestamp)) {
            embed.setTimestamp(timestamp);
        }
    }

    await channel.send({ embeds: [embed] });
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

            const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
            if (!channel) return console.error("❌ [DISCORD] Channel tidak ditemukan!");

            const embed = new EmbedBuilder()
                .setColor("#ff66aa")
                .setTitle(`${response.data.username} Status`)
                .setDescription(`Status Pemain: **${playerStatus}**`)
                .setFooter({
                    text: "Osu! Player Status",
                    iconURL: response.data.avatar_url || "https://osu.ppy.sh/favicon.ico" // Menggunakan foto profil pemain
                });

            await channel.send({ embeds: [embed] });
            console.log(`✅ Status ${response.data.username}: ${playerStatus}`);
        }
    } catch (error) {
        console.error("❌ [OSU] Gagal memeriksa status pemain", error.response?.data || error.message);
    }
}

// Event ketika bot siap
client.once("ready", () => {
    console.log(`✅ [DISCORD] Bot ${client.user.tag} siap!`);
    console.log("🔄 Memulai pemantauan skor setiap 5 detik...");
    setInterval(checkScores, 5000); // Memeriksa skor setiap 5 detik
    setInterval(checkPlayerStatus, 10000); // Memeriksa status pemain setiap 10 detik
});

// Login ke Discord
client.login(process.env.DISCORD_TOKEN);
