const worlds = [
  // K-POP
  {
    title: "BTS",
    image: "banners/bts.jpg",
    desc: "BTS, also known as the Bangtan Boys, is a South Korean boy band formed in 2010. The band consists of Jin, Suga, J-Hope, RM, Jimin, V, and Jung Kook.",
    tags: ["Emotional", "Intense"],
    category: "K-Pop"
  },
  {
    title: "BLACKPINK",
    image: "banners/blackpink.jpg",
    desc: "Blackpink is a South Korean girl group formed by YG Entertainment. The group is composed of four members: Jisoo, Jennie, Rosé, and Lisa.",
    tags: ["Fierce", "Glamorous"],
    category: "K-Pop"
  },
  {
    title: "TWICE",
    image: "banners/twice.jpg",
    desc: "Twice is a South Korean girl group formed by JYP Entertainment. The group is composed of nine members: Nayeon, Jeongyeon, Momo, Sana, Jihyo, Mina, Dahyun, Chaeyoung, and Tzuyu.",
    tags: ["Upbeat", "Feel-good Pop"],
    category: "K-Pop"
  },
  {
    title: "Stray Kids",
    image: "banners/straykids.jpg",
    desc: "Stray Kids is a South Korean boy band formed by JYP Entertainment in 2017. The band has eight members: Bang Chan, Lee Know, Changbin, Hyunjin, Han, Felix, Seungmin, and I.N.",
    tags: ["Experimental", "Self-produced"],
    category: "K-Pop"
  },
  {
    title: "aespa",
    image: "banners/aespa.jpg",
    desc: "SM's 4-member metaverse-concept girl group with a futuristic, lore-heavy universe and a signature dark pop sound.",
    tags: ["Futuristic", "Dark Pop"],
    category: "K-Pop"
  },
  {
    title: "NewJeans",
    image: "banners/newjeans.jpg",
    desc: "NewJeans is a five-member girl group under ADOR known for blending Y2K aesthetics with indie pop and R&B. Members include Minji, Hanni, Danielle, Haerin, and Hyein.",
    tags: ["Y2K", "Nostalgia"],
    category: "K-Pop"
  },
  {
    title: "SEVENTEEN",
    image: "banners/seventeen.jpg",
    desc: "SEVENTEEN is a 13-member self-producing boy group under PLEDIS Entertainment, divided into vocal, hip-hop, and performance units. Known for their intricate synchronization and chaotic group dynamics.",
    tags: ["Synchronization", "Chaos"],
    category: "K-Pop"
  },
  {
    title: "NCT",
    image: "banners/nct.jpg",
    desc: "NCT is SM Entertainment's large-scale boy group concept with an open, unlimited membership system spanning subunits NCT 127, NCT Dream, and WayV. Known for experimental production and infinite expansion.",
    tags: ["Infinite", "Experimental"],
    category: "K-Pop"
  },
  {
    title: "Red Velvet",
    image: "banners/redvelvet.jpg",
    desc: "Red Velvet is a five-member girl group under SM Entertainment known for their dual concept: bright \"Red\" pop and \"Velvet\" R&B. Members are Irene, Seulgi, Wendy, Joy, and Yeri.",
    tags: ["Upbeat Pop", "R&B"],
    category: "K-Pop"
  },
  {
    title: "ENHYPEN",
    image: "banners/enhyphen.jpg",
    desc: "ENHYPEN is a seven-member boy group formed through the survival show I-Land under BELIFT LAB. Their lore revolves around vampires and the duality of darkness and light, with members Jungwon, Heeseung, Jay, Jake, Sunghoon, Sunoo, and Ni-ki.",
    tags: ["Dark", "Vampire Lore"],
    category: "K-Pop"
  },
  {
    title: "LE SSERAFIM",
    image: "banners/lesserafim.jpg",
    desc: "LE SSERAFIM is a five-member girl group under SOURCE MUSIC known for their fearless, powerful stage presence. Members include Sakura, Kim Chaewon, Huh Yunjin, Kazuha, and Hong Eunchae.",
    tags: ["Fearless", "Alternative Pop"],
    category: "K-Pop"
  },
  {
    title: "TOMORROW X TOGETHER",
    image: "banners/tomorrowxtogether.jpg",
    desc: "Tomorrow X Together, commonly abbreviated as TXT, is a South Korean boy band formed by Big Hit Entertainment. The group consists of five members: Yeonjun, Soobin, Beomgyu, Taehyun, and Hueningkai.",
    tags: ["Fantasy", "Deep Lore"],
    category: "K-Pop"
  },
  {
    title: "ITZY",
    image: "banners/itzy.jpg",
    desc: "ITZY is a five-member girl group under JYP Entertainment known for their self-confidence anthems and high-energy performances. Members are Yeji, Lia, Ryujin, Chaeryeong, and Yuna.",
    tags: ["Confidence", "Neon"],
    category: "K-Pop"
  },
  {
    title: "SHINee",
    image: "banners/shinee.jpg",
    desc: "SHINee is a legendary SM Entertainment boy group that debuted in 2008, pioneering the \"contemporary band\" concept in K-pop. Known for powerhouse vocals, genre-blending sound, and a legacy that shaped an entire generation of idols.",
    tags: ["Vocal", "Legendary"],
    category: "K-Pop"
  },
  {
    title: "IVE",
    image: "banners/ive.jpg",
    desc: "IVE is a six-member girl group under Starship Entertainment that debuted in 2021. Known for their sleek, elegant concept and self-love messaging, members include Yujin, Gaeul, Rei, Wonyoung, Liz, and Leeseo.",
    tags: ["Elegant", "Chic"],
    category: "K-Pop"
  },

  // HIP-HOP & POP
  {
    title: "Barbz World",
    image: "banners/nicki.jpg",
    desc: "The high-voltage universe of Nicki Minaj and her Barbz fanbase — a world of unapologetic confidence, rap royalty clashes, and neon-pink maximalism. Drama is always pending.",
    tags: ["Rap Royalty", "Chaotic"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Rap Universe",
    image: "banners/hiphop.jpg",
    desc: "A sprawling world where rap legends and rising stars collide — cyphers, beefs, collaborations, and street credibility are the currency. From golden-era classics to drill and trap.",
    tags: ["Street", "Gritty"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Pop Royalty",
    image: "banners/pop.jpg",
    desc: "The glittering world of mainstream pop stardom — stadium shows, chart battles, iconic reinventions, and parasocial fan devotion at its peak. Where every era is a statement.",
    tags: ["Glittery", "Stadium-scale"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Swiftie Universe",
    image: "banners/taylorswift.jpg",
    desc: "Taylor Swift's ever-expanding world of eras, easter eggs, and devoted Swifties. Each album is a new aesthetic chapter — from country roots to synth-pop, folk, and pop-rock reinvention.",
    tags: ["Era-coded", "Lore-heavy"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Opium World",
    image: "banners/playboi.jpg",
    desc: "The dark, fashion-forward universe of Playboi Carti, Ken Carson, and the Opium collective. Vamp aesthetics, rage beats, and an anti-mainstream ethos that somehow became the mainstream.",
    tags: ["Vamp", "Rage"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Kendrick Universe",
    image: "banners/kendrick.jpg",
    desc: "Kendrick Lamar's Compton-rooted world of poetic lyricism, concept albums, and unflinching social commentary. A universe where bars carry weight and every album is a thesis statement.",
    tags: ["Poetic", "Compton"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Renaissance World",
    image: "banners/beyonce.jpg",
    desc: "Beyoncé's multidimensional universe of ballroom culture, Black excellence, and flawless artistry. A world where the Renaissance reigns and every performance is a spiritual experience.",
    tags: ["Ballroom", "Flawless"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "The Weeknd Universe",
    image: "banners/weeknd.jpg",
    desc: "The XO universe — a noir-drenched world of heartbreak, hedonism, and cinematic R&B. Abel Tesfaye's Starboy persona stalks through neon-lit cities and after-hours shadows.",
    tags: ["Dark", "Melancholic"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Ye World",
    image: "banners/kanye.jpg",
    desc: "Kanye West's ever-polarizing world of sonic genius and controversy. From College Dropout soul samples to gospel minimalism — a universe where artistic vision and chaos coexist.",
    tags: ["Genius", "Controversial"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Ariana Universe",
    image: "banners/ariana.jpg",
    desc: "Ariana Grande's world of whistle notes, ponytail iconography, and emotional depth — from bubblegum pop to trap-infused R&B. Arianators live for the high notes and the healing eras.",
    tags: ["Vocals", "Sweetener"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Billie Eilish World",
    image: "banners/billie.jpg",
    desc: "Billie Eilish and Finneas's whisper-to-scream world of bedroom pop, body politics, and Gen Z anxiety. A universe draped in oversized fits, ASMR production, and unflinching honesty.",
    tags: ["Alt-Pop", "Moody"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Olivia Rodrigo Universe",
    image: "banners/olivia.jpg",
    desc: "Olivia Rodrigo's world of teenage heartbreak, purple guitars, and pop-punk catharsis. SOUR to GUTS — a universe where every ex deserves a banger and every feeling deserves validation.",
    tags: ["Angsty", "Y2K"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Dua Lipa World",
    image: "banners/dualipa.jpg",
    desc: "Dua Lipa's retro-disco universe of dance-floor anthems and effortless cool. Future Nostalgia redefined pop music and planted this world firmly on the dance floor, where the rules are made up and the BPM stays high.",
    tags: ["Disco", "Dance"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Gaga Universe",
    image: "banners/gaga.jpg",
    desc: "Lady Gaga's avant-garde world of Little Monsters, theatrical spectacle, and genre-defying artistry. From meat dresses to jazz standards — a universe where reinvention is religion and pop is performance art.",
    tags: ["Avant-garde", "Theater"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Lana Del Rey Universe",
    image: "banners/lana.jpg",
    desc: "Lana Del Rey's dreamy, sun-soaked world of Americana tragedy, coquette aesthetics, and cinematic sadness. A universe of poolside melancholy, vintage glamour, and sad girls who know every lyric.",
    tags: ["Coquette", "Vintage"],
    category: "Hip-Hop & Pop"
  },
  {
    title: "Harry Styles World",
    image: "banners/harrystyles.jpg",
    desc: "Harry Styles's world of rock-infused pop, gender-fluid fashion, and radical kindness. From One Direction heartthrob to Coachella headliner — a universe built on feather boas, retro vibes, and treating people with kindness.",
    tags: ["Retro", "Kindness"],
    category: "Hip-Hop & Pop"
  },

  // ANIME & FILM/TV
  {
    title: "Naruto Universe",
    image: "banners/naruto.jpg",
    desc: "The Hidden Leaf Village and beyond — a world of ninja clans, tailed beasts, and never-give-up determination. From Team 7's formation to the Fourth Great Ninja War, believe it.",
    tags: ["Shonen", "Believe It"],
    category: "Anime & Film/TV"
  },
  {
    title: "Jujutsu Kaisen",
    image: "banners/jjk.jpg",
    desc: "Gege Akutami's brutal world of cursed spirits, cursed energy, and jujutsu sorcerers fighting to protect humanity. High-stakes battles, unexpected deaths, and some of the most creative fight choreography in anime.",
    tags: ["Curses", "High Stakes"],
    category: "Anime & Film/TV"
  },
  {
    title: "Attack on Titan",
    image: "banners/aot.jpg",
    desc: "Hajime Isayama's dark masterpiece — humanity encircled by Titans and secrets darker than the walls themselves. A world where every answer raises more questions and no character is safe.",
    tags: ["Titans", "Psychological"],
    category: "Anime & Film/TV"
  },
  {
    title: "Demon Slayer",
    image: "banners/demonslayer.jpg",
    desc: "Tanjiro Kamado's quest to cure his demon-turned sister in Taisho-era Japan. Kimetsu no Yaiba's world of breathing techniques, Hashira, and Muzan's twelve Kizuki — with animation that redefined the medium.",
    tags: ["Taisho-era", "Brotherhood"],
    category: "Anime & Film/TV"
  },
  {
    title: "HBO Universe",
    image: "banners/hbo.jpg",
    desc: "The prestige TV universe spanning Euphoria's neon-lit teen drama, The Wire's Baltimore streets, Succession's power-hungry families, and everything else HBO has made compulsively watchable.",
    tags: ["Prestige TV", "Drama"],
    category: "Anime & Film/TV"
  },
  {
    title: "Marvel Universe",
    image: "banners/marvel.jpg",
    desc: "The MCU and comics alike — a sprawling multiverse of superheroes, world-ending threats, and interconnected storylines. From Iron Man's arc reactor to the Multiverse Saga's reality-bending chaos.",
    tags: ["Superheroes", "Multiverse"],
    category: "Anime & Film/TV"
  },
  {
    title: "Disney Universe",
    image: "banners/disney.jpg",
    desc: "The magical world of Disney animated classics, princesses, and the iconic stories that defined childhoods worldwide. From Snow White to Encanto — a universe where wishes come true and songs solve everything.",
    tags: ["Magical", "Nostalgic"],
    category: "Anime & Film/TV"
  },
  {
    title: "One Piece",
    image: "banners/onepiece.jpg",
    desc: "Eiichiro Oda's epic nautical adventure following Monkey D. Luffy and the Straw Hat Pirates across the Grand Line in search of the legendary treasure One Piece. An interconnected world of Devil Fruits, epic sea battles, and found family.",
    tags: ["Adventure", "Peak Fiction"],
    category: "Anime & Film/TV"
  },
  {
    title: "Bleach",
    image: "banners/bleach.jpg",
    desc: "Tite Kubo's Soul Society saga — a world of Soul Reapers, Hollows, and Arrancar spanning the living world and beyond. Iconic Bankai reveals, drip-coded captains, and a fan-favorite Thousand-Year Blood War arc.",
    tags: ["Soul Reapers", "Drip"],
    category: "Anime & Film/TV"
  },
  {
    title: "Chainsaw Man",
    image: "banners/chainsawman.jpg",
    desc: "Tatsuki Fujimoto's genre-defying world where Devils manifest from human fear and Denji — merged with his chainsaw dog Pochita — navigates a brutal, absurd existence as a Devil Hunter. Unhinged, gory, and weirdly heartwarming.",
    tags: ["Unhinged", "Gory"],
    category: "Anime & Film/TV"
  },
  {
    title: "My Hero Academia",
    image: "banners/mha.jpg",
    desc: "Kohei Horikoshi's hero society — a world where 80% of humanity has superpowers called Quirks and young Izuku Midoriya strives to become the greatest hero. Passionate debates, power rankings, and a surprisingly deep villain backstory.",
    tags: ["Heroes", "Quirks"],
    category: "Anime & Film/TV"
  },
  {
    title: "Haikyu!!",
    image: "banners/haikyuu.jpg",
    desc: "Haruichi Furudate's beloved volleyball sports anime following Shoyo Hinata and Karasuno High School's quest to reach nationals. A comfort series built on teamwork, rival dynamics, and matches that somehow make volleyball feel like life or death.",
    tags: ["Volleyball", "Comfort"],
    category: "Anime & Film/TV"
  },
  {
    title: "Star Wars",
    image: "banners/starwars.jpg",
    desc: "A galaxy far, far away — the Force, the Sith, the Rebellion, and decades of lore spanning nine films, animated series, and expanded universe content. A fandom defined by deep passion, intense debate, and lightsaber allegiances.",
    tags: ["The Force", "Deep Lore"],
    category: "Anime & Film/TV"
  },
  {
    title: "Stranger Things",
    image: "banners/strangerthings.jpg",
    desc: "Hawkins, Indiana — a cozy 1980s suburb haunted by the Upside Down. Eleven's telekinetic powers, Demogorgons, the Mind Flayer, and a friend group whose loyalty transcends dimensions. Pure 80s nostalgia soaked in supernatural dread.",
    tags: ["80s Nostalgia", "Supernatural"],
    category: "Anime & Film/TV"
  },
  {
    title: "The Office",
    image: "banners/theoffice.jpg",
    desc: "Dunder Mifflin's Scranton branch — a mockumentary world of painfully relatable workplace absurdity, Michael Scott's cringe-comedy, and the slow-burn Jim and Pam romance. The ultimate comfort rewatch and meme goldmine.",
    tags: ["Meme-heavy", "Comfort"],
    category: "Anime & Film/TV"
  },

  // FANTASY
  {
    title: "Wizarding World",
    image: "banners/harrypotter.jpg",
    desc: "J.K. Rowling's magical Britain — Hogwarts, Diagon Alley, the Ministry of Magic, and Voldemort's shadow looming over all. A world of house loyalty, wand allegiances, and a fandom that never truly graduated.",
    tags: ["Magic", "House Pride"],
    category: "Fantasy"
  },
  {
    title: "Middle Earth",
    image: "banners/lotr.jpg",
    desc: "Tolkien's meticulously crafted world of hobbits, elves, dwarves, and men — where the fate of all free peoples rests on a Fellowship carrying one Ring to Mordor. Mythology, languages, and lore that set the blueprint for all fantasy.",
    tags: ["Epic", "Mythology"],
    category: "Fantasy"
  },
  {
    title: "Westeros",
    image: "banners/got.jpg",
    desc: "George R.R. Martin's brutal world of political intrigue, dragon warfare, and houses warring for the Iron Throne. No character is safe, alliances shift like sand, and winter is always coming.",
    tags: ["Political", "Dragons"],
    category: "Fantasy"
  },
  {
    title: "Percy Jackson Universe",
    image: "banners/percyjackson.jpg",
    desc: "Rick Riordan's Camp Half-Blood — a modern world where Greek gods walk among us and their demigod children train for quests. Mythology repackaged with ADHD humor, found family, and a dyslexic hero who reads Ancient Greek by instinct.",
    tags: ["Demigods", "Mythology"],
    category: "Fantasy"
  },
  {
    title: "Genshin Impact",
    image: "banners/genshin.jpg",
    desc: "miHoYo's open-world RPG — the Traveler journeys across the seven nations of Teyvat, each ruled by an Archon and a different element. Rich lore, obsessive character simping, and a gacha system that has claimed countless wallets.",
    tags: ["Gacha", "Deep Lore"],
    category: "Fantasy"
  },
  {
    title: "Elden Ring",
    image: "banners/eldenring.jpg",
    desc: "FromSoftware and George R.R. Martin's punishing open world — the Tarnished seeks to become Elden Lord in the shattered Lands Between. A world defined by cryptic lore, brutal bosses, and the sweet agony of learning to git gud.",
    tags: ["Tarnished", "Lore & Pain"],
    category: "Fantasy"
  },
  {
    title: "Cyberpunk 2077",
    image: "banners/cyberpunk.jpg",
    desc: "CD Projekt Red's dystopian Night City — a neon megacity of corpo politics, street gangs, and mercenaries chasing immortality. V navigates a world drowning in chrome, capitalism, and the ghost of a dead rockstar living in their head.",
    tags: ["Futuristic", "Neon"],
    category: "Fantasy"
  },
  {
    title: "Dune World",
    image: "banners/dune.jpg",
    desc: "Frank Herbert's Arrakis — a desert planet and the sole source of the universe's most valuable substance: the spice Melange. A world of feudal politics, Bene Gesserit prophecy, Fremen culture, and sandworms the size of cathedrals.",
    tags: ["Political", "Spice"],
    category: "Fantasy"
  },
  {
    title: "Avatar: The Last Airbender",
    image: "banners/avatar.jpg",
    desc: "The four nations divided by the elements — Water, Earth, Fire, and Air. The Avatar must master all four bending arts to restore balance to a world at war. A childhood cornerstone elevated to timeless myth.",
    tags: ["Benders", "Balance"],
    category: "Fantasy"
  },
  {
    title: "Doctor Who",
    image: "banners/doctorwho.jpg",
    desc: "The TARDIS travels anywhere in time and space — a beloved British sci-fi universe spanning 60+ years, multiple Doctors, and a fandom of devoted Whovians. Timey-wimey logic, sonic screwdrivers, and alien threats that never quite follow the rules.",
    tags: ["Timey-Wimey", "Nostalgic"],
    category: "Fantasy"
  },
  {
    title: "Breaking Bad Universe",
    image: "banners/breakingbad.jpg",
    desc: "Albuquerque's Heisenberg saga — a high school chemistry teacher turned methamphetamine kingpin. From Better Call Saul to El Camino, a universe of moral collapse, unforgettable antiheroes, and some of the tightest TV writing ever produced.",
    tags: ["Sigma", "Chemistry"],
    category: "Fantasy"
  },
  {
    title: "The Sandman Universe",
    image: "banners/sandman.jpg",
    desc: "Neil Gaiman's mythological DC universe — the Endless family of Dream, Death, Desire, Despair, Destiny, Delirium, and Destruction govern the forces that shape all living things. Dark, literary, and endlessly imaginative.",
    tags: ["Mythological", "Ethereal"],
    category: "Fantasy"
  },
  {
    title: "The Witcher Universe",
    image: "banners/witcher.jpg",
    desc: "Andrzej Sapkowski's Continent — a morally grey world where monster hunters called Witchers navigate human politics more dangerous than any beast. Geralt of Rivia, Yennefer, and Ciri form a chosen family across games, books, and television.",
    tags: ["Morally Grey", "Monster Hunter"],
    category: "Fantasy"
  },
  {
    title: "Critical Role Universe",
    image: "banners/criticalrole.jpg",
    desc: "Exandria — the rich D&D homebrew world birthed from Matt Mercer's campaigns. Vox Machina, the Mighty Nein, and Bells Hells have made tabletop roleplay a spectator sport with millions of Critters hanging on every dice roll.",
    tags: ["D&D", "Emotional"],
    category: "Fantasy"
  },
  {
    title: "Baldur's Gate Universe",
    image: "banners/faerun.jpg",
    desc: "Faerûn's Forgotten Realms — from the Sword Coast to the depths of Avernus. Baldur's Gate 3 brought D&D's richest campaign setting to a new generation with unmatched character depth, romance arcs, and the absolute menace of Astarion.",
    tags: ["D&D", "RPG"],
    category: "Fantasy"
  },

  // SPORTS
  {
    title: "Football World",
    image: "banners/football.jpg",
    desc: "The beautiful game — from Premier League drama to World Cup glory. A universe of legendary clubs, GOAT debates between Messi and Ronaldo, transfer window chaos, and 90-minute emotional rollercoasters felt by billions.",
    tags: ["Beautiful Game", "Global"],
    category: "Sports"
  },
  {
    title: "NBA World",
    image: "banners/nba.jpg",
    desc: "The Association — where superstars become icons and dynasties define eras. LeBron vs. Jordan debates, superteam formations, All-Star Weekend, and a league culture that bleeds into fashion, music, and global youth identity.",
    tags: ["Superstar", "Legacy"],
    category: "Sports"
  },
  {
    title: "Formula 1",
    image: "banners/f1.jpg",
    desc: "The pinnacle of motorsport — 20 drivers, 10 teams, and a calendar spanning five continents. Paddock politics, tire strategies, and rivalries as intense as any soap opera. Drive to Survive introduced a new generation to the grid's chaos.",
    tags: ["Paddock Drama", "Speed"],
    category: "Sports"
  },
  {
    title: "WWE Universe",
    image: "banners/wwe.jpg",
    desc: "Sports entertainment at its most theatrical — championships, feuds, heel turns, and promos that blur the line between sport and spectacle. From attitude era legends to modern-day Roman Reigns dominance, kayfabe is always maintained.",
    tags: ["Kayfabe", "Storylines"],
    category: "Sports"
  },
  {
    title: "NFL World",
    image: "banners/nfl.jpg",
    desc: "America's most-watched sport — 32 franchises, a 17-week regular season, and a Super Bowl that becomes a national event. Fantasy football leagues, tailgate culture, quarterback debates, and Travis Kelce's cultural crossover moment.",
    tags: ["Fantasy Football", "Tailgate"],
    category: "Sports"
  },
  {
    title: "UFC World",
    image: "banners/ufc.jpg",
    desc: "The Ultimate Fighting Championship — where striking, wrestling, and grappling collide inside the octagon. Conor McGregor's trash-talk era, Jon Jones's dominance, and pre-fight press conferences that go as hard as the fights themselves.",
    tags: ["Trash Talk", "Hype"],
    category: "Sports"
  },
  {
    title: "NHL World",
    image: "banners/nhl.jpg",
    desc: "The fastest sport on ice — Stanley Cup dynasties, playoff hockey intensity, and a brotherhood built through the grind of an 82-game season. A world of chirps, enforcers, and the most passionate fanbase in North American sports.",
    tags: ["Stanley Cup", "Ice & Grit"],
    category: "Sports"
  },
  {
    title: "Tennis World",
    image: "banners/tennis.jpg",
    desc: "The Grand Slam circuit — Wimbledon grass, Roland Garros clay, US Open hard courts, and the endless GOAT debate between Djokovic, Federer, and Nadal. A world of mental fortitude, elegant athleticism, and the loneliest battles in sport.",
    tags: ["Grand Slam", "GOAT Debate"],
    category: "Sports"
  },
  {
    title: "MLB World",
    image: "banners/mlb.jpg",
    desc: "America's pastime — 162 games, a World Series, and the mythological status of baseball history. Shohei Ohtani's two-way brilliance, Yankee Stadium pageantry, and a sport that moves slower than others but hits harder in the memory.",
    tags: ["America's Pastime", "Legacy"],
    category: "Sports"
  },
  {
    title: "Esports Universe",
    image: "banners/esports.jpg",
    desc: "Competitive gaming at the highest level — League of Legends World Championship, CS2 Majors, Valorant Champions, and the players who became household names on LAN stages before millions of online viewers.",
    tags: ["Competitive", "LAN Stage"],
    category: "Sports"
  },
  {
    title: "Golf World",
    image: "banners/golf.jpg",
    desc: "The Masters, the Open Championship, and the rise of LIV Golf splitting the sport. Tiger Woods's legacy, the next generation led by Rory McIlroy and Scottie Scheffler, and a sport reinventing its image for younger audiences.",
    tags: ["Majors", "Legacy"],
    category: "Sports"
  },
  {
    title: "Olympics Universe",
    image: "banners/olympics.jpg",
    desc: "Every four years the world watches — Simone Biles's gravity-defying gymnastics, Usain Bolt's legendary sprints, and the pure emotion of athletes reaching the pinnacle of human achievement under the Olympic rings.",
    tags: ["World Stage", "Glory"],
    category: "Sports"
  },
  {
    title: "Street Ball Universe",
    image: "banners/nba2k.jpg",
    desc: "Rucker Park, AND1 Mixtapes, and the streetball legends who turned playgrounds into proving grounds. A world where handles, crossovers, and ankle-breaking moves earn more respect than any trophy — raw, unfiltered basketball culture.",
    tags: ["Street Cred", "Handles"],
    category: "Sports"
  },
  {
    title: "Tour de France",
    image: "banners/cycling.jpg",
    desc: "Three weeks, 21 stages, and the world's most grueling athletic event carved through the French countryside and Alps. A world of team tactics, breakaways, doping scandals, and the yellow jersey as the ultimate prize in endurance sport.",
    tags: ["Endurance", "Yellow Jersey"],
    category: "Sports"
  },
  {
    title: "WNBA World",
    image: "banners/wnba.jpg",
    desc: "Women's basketball at its finest — Caitlin Clark's generational impact, A'ja Wilson's dominance, and a league entering a cultural moment unlike any before. Style, substance, and a fanbase growing louder every season.",
    tags: ["Rise Up", "Game Changing"],
    category: "Sports"
  },
];
