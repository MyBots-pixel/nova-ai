module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {

        const {
            message,
            history = []
        } = req.body;


        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Message is required"
            });
        }


        const apiKey =
            process.env.OPENROUTER_API_KEY;


        if (!apiKey) {
            return res.status(500).json({
                error: "OPENROUTER_API_KEY is not configured"
            });
        }


        /*
            Build conversation history.
        */

        const messages = [

            {
                role: "system",
                content:
                    "You are Nova AI, a helpful, friendly and intelligent AI assistant. Give clear, useful answers and remember the context of the conversation."
            }

        ];


        /*
            Add previous messages.
        */

        if (Array.isArray(history)) {

            history
                .filter(item =>
                    item &&
                    (item.role === "user" ||
                     item.role === "assistant") &&
                    typeof item.content === "string"
                )
                .forEach(item => {

                    messages.push({

                        role: item.role,

                        content: item.content

                    });

                });

        }


        /*
            Add current message.
        */

        messages.push({

            role: "user",

            content: message

        });


        /*
            Send conversation to OpenRouter.
        */

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${apiKey}`,

                    "HTTP-Referer":
                        "https://nova-ai.vercel.app",

                    "X-Title":
                        "Nova AI"

                },

                body: JSON.stringify({

                    model:
                        "openrouter/free",

                    messages:
                        messages

                })

            }
        );


        const data =
            await response.json();


        /*
            OpenRouter error.
        */

        if (!response.ok) {

            console.error(
                "OpenRouter error:",
                data
            );

            return res.status(
                response.status
            ).json({

                error:
                    data.error?.message ||
                    "AI request failed."

            });

        }


        /*
            Get AI response.
        */

        const reply =
            data.choices?.[0]?.message?.content ||
            "I couldn't generate a response.";


        return res.status(200).json({

            reply: reply

        });


    } catch (error) {

        console.error(
            "Server error:",
            error
        );


        return res.status(500).json({

            error:
                "Something went wrong."

        });

    }

};
