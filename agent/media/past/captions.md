# What Gemini sees in the channel's past posters

One line per poster: `- poster: <file> — <two sentences> tags: a, b, c`. Each line becomes a
passage in the RAG corpus beside the comments; read_feedback hands the file name back as
a URL under /static/past/. Regenerate with: python -m agent.platform.rag load --caption

- poster: sock-ghost.png — A small sheet ghost with big glossy eyes rises out of an open sock drawer while one striped sock floats above it, a jack-o'-lantern glowing on the dresser. Lavender dusk, candlelight cream and pumpkin orange, cozy and a little mischievous. tags: ghost, bedroom, socks
- poster: candy-heist.png — A tiny masked raccoon in a vampire cape freezes mid-reach at an open glowing fridge, a bowl of wrapped candy on the shelf. Midnight plum kitchen, warm fridge light, playful heist mood. tags: raccoon, kitchen, candy
- poster: costume-cat.png — A round cream cat in a tiny witch hat judges three small costumes laid out on a bed: a ghost sheet, a pumpkin, a bat cape. Candlelight and lavender, deadpan and sweet. tags: cat, costumes, judging
- poster: pumpkin-ghost.png — A small sheet ghost with big glossy eyes holds a carving spoon beside the pumpkin it just carved, a crooked, happy face glowing from inside, seeds scattered on the counter, bats and a full moon behind. Lavender dusk, pumpkin orange and cream, proud and clumsy. tags: ghost, pumpkin, carving
- poster: bat-lamp.png — A desk lamp at night with a small round bat hanging upside down from it, hugging the bulb like a pillow, a mug and a laptop below and the moon in the window. Plum and candlelight, calm and cozy. tags: bat, desk, night
- poster: skeleton-sweater.png — A small friendly skeleton sits in an open closet hugging a cream knitted sweater, paper bats above and a jack-o'-lantern at its feet. Lavender and plum dusk, soft and tender. tags: skeleton, closet, sweater
