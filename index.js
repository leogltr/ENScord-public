require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./db');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});


const questions = [
    { id: 1, texte: "Comment trouves-tu ce projet jusqu'à présent ?", type: "texte" },
    { id: 2, texte: "Sur une échelle de 1 à 10, comment notes-tu l'idée ?", type: "nombre" },
    { id: 3, texte: "As-tu d'autres suggestions ?", type: "texte" }
];


const currentSondageId = 1;

client.once('ready', () => {
    console.log(`Bot connecté (${client.user.tag}) !`);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'publier') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_dm_survey').setLabel('Démarrer le sondage').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '**Nouveau sondage disponible. **\nParticipez en privé.', components: [row] });
    } 
    
    else if (interaction.isButton() && interaction.customId === 'start_dm_survey') {
        await interaction.reply({ content: 'Regarde tes messages privés.', ephemeral: true });

        try {
            const dmChannel = await interaction.user.createDM();
            await dmChannel.send(`J'ai ${questions.length} questions pour toi.\n\n**1. ${questions[0].texte}**`);

            const answers = [];
            let currentIndex = 0;

            const collector = dmChannel.createMessageCollector({
                filter: message => message.author.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async message => {
                const currentQuestion = questions[currentIndex];
                const reponseUtilisateur = message.content.trim();

                if (currentQuestion.type === "nombre") {
                    if (isNaN(reponseUtilisateur)) {
                        await dmChannel.send(`**Erreur :** Je n'attends qu'un nombre pour cette question. Réessaie :\n*${currentQuestion.texte}*`);
                        return;
                    }
                }

                answers.push({ question_id: currentQuestion.id, valeur: reponseUtilisateur });
                currentIndex++;

                if (currentIndex < questions.length) {
                    await dmChannel.send(`**${currentIndex + 1}. ${questions[currentIndex].texte}**`);
                } else {
                    collector.stop('finished');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'finished') {
                    try {
                        const [participationResult] = await db.execute(
                            'INSERT INTO participations (sondage_id, user_id, username) VALUES (?, ?, ?)',
                            [currentSondageId, interaction.user.id, interaction.user.tag]
                        );
                        const participationId = participationResult.insertId;

                        for (const rep of answers) {
                            await db.execute(
                                'INSERT INTO reponses (participation_id, question_id, valeur) VALUES (?, ?, ?)',
                                [participationId, rep.question_id, rep.valeur]
                            );
                        }

                        await dmChannel.send(`Tes réponses ont été enregistrées avec succès.`);
                    } catch (error) {
                        console.error("Erreur BDD :", error);
                        await dmChannel.send(`Une erreur est survenue lors de la sauvegarde.`);
                    }
                }
            });
        } catch (error) {
            console.error(error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);