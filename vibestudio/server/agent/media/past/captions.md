# What Gemini sees in the channel's past posters

One line per poster: `- poster: <file> — <two sentences> tags: a, b, c`. Each line becomes a
passage in the RAG corpus beside the comments; read_feedback hands the file name back as
a URL under /static/past/. Regenerate with: python -m agent.platform.rag load --caption

- poster: sock-dragon.png — A sock drawer stands open and a tiny low-poly dragon sleeps curled on a hoard of folded socks, one claw on a lone striped sock. Cream, peach and lavender dusk light, a pastel pumpkin on the dresser, calm and cozy. tags: small magic, bedroom, dragon
- poster: fridge-heist.png — A kitchen at midnight, the fridge door ajar and spilling warm light, a small masked raccoon frozen mid-reach for a plate of candy. Soft lavender shadows, mint and butter-yellow highlights, playful heist mood. tags: midnight, kitchen, heist
- poster: desk-toys.png — Desk toys have come alive after dark: a wind-up pumpkin leads a line of figurines across a wooden desk under a glowing lamp. Faceted pastel shapes, peach and lavender, mischievous and gentle. tags: desk, toys, after midnight
- poster: cat-judge.png — A low-poly cat sits on a kitchen counter judging a row of gadgets, one of them a carved jack-o'-lantern, with a slow unimpressed blink. Cream counter, mint tiles, pumpkin-orange accents, deadpan funny. tags: cat, gadgets, kitchen
- poster: plant-doc.png — A houseplant in a tiny explorer hat sits beside a candle, framed like a nature documentary still, roots spilling from a cracked pot. Lavender dusk window, butter-yellow candlelight, brave and sweet. tags: houseplant, documentary, candle
- poster: snail-race.png — A snail and a robot vacuum race down a hallway lit by paper lanterns, the snail a half-length ahead. Long low angle, peach floor, lanterns in pumpkin orange and mint, slow-motion excitement. tags: race, hallway, lanterns
