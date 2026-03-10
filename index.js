require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const questions = [
    "Comment est le projet?",
    "Quelles fonctionnalités aimerais-tu voir?",
    "Sur une échelle de 1 à 10, comment notes-tu ton expérience?"
];

client.once('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    console.log(`Prêt à envoyer les données`);
});

client.on('interactionCreate', async interaction => {
    
    if (interaction.isChatInputCommand() && interaction.commandName === 'publier') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_dm_survey')
                .setLabel('Commencer le sondage en privé')
                .setStyle(ButtonStyle.Success),
        );

        await interaction.reply({ 
            content: '**Nouveau sondage disponible. **\nCliquez sur le bouton pour y répondre en message privé.', 
            components: [row] 
        });
    } 
    
    else if (interaction.isButton() && interaction.customId === 'start_dm_survey') {
        await interaction.reply({ content: 'Regarde les dms', ephemeral: true });

        try {
            const dmChannel = await interaction.user.createDM();
            await dmChannel.send(`J'ai ${questions.length} questions pour toi. On commence :\n\n**1. ${questions[0]}**`);

            const answers = [];
            let currentQuestion = 0;

            const collector = dmChannel.createMessageCollector({
                filter: message => message.author.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async message => {
                answers.push(message.content);
                currentQuestion++;

                if (currentQuestion < questions.length) {
                    await dmChannel.send(`**${currentQuestion + 1}. ${questions[currentQuestion]}**`);
                } else {
                    collector.stop('finished');
                }
            });

            // Quand le sondage est fini
            collector.on('end', async (collected, reason) => {
                if (reason === 'finished') {
                    try {
                        // 2. ENVOI DES DONNÉES VERS MYSQL
                        const [result] = await pool.execute(
                            'INSERT INTO responses (user_id, username, q1, q2, q3) VALUES (?, ?, ?, ?, ?)',
                            [interaction.user.id, interaction.user.tag, answers[0], answers[1], answers[2]]
                        );

                        console.log(`Réponses sauvegardées dans MySQL ! ID de la ligne : ${result.insertId}`);
                        await dmChannel.send(`Tes réponses ont bien été enregistrées dans notre base de données.`);

                    } catch (dbError) {
                        console.error("Erreur lors de l'insertion dans MySQL :", dbError);
                        await dmChannel.send(`Une erreur est survenue lors de la sauvegarde de tes réponses.`);
                    }
                } else {
                    await dmChannel.send('Tu as mis trop de temps à répondre. Le sondage est annulé.');
                }
            });

        } catch (error) {
            console.error("Erreur DM :", error);
            await interaction.followUp({ content: 'Impossible de t\'envoyer un message privé.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);