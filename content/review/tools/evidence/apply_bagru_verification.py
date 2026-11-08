import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from source_archive import cut, load

if len(sys.argv) != 3:
    sys.exit("usage: apply_bagru_verification.py <content/traditions/bagru/tradition.json> <archive folder>")
PATH, FOLDER = sys.argv[1], sys.argv[2]
REMOVED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "removed-relationships.json")
doc = json.load(open(PATH, encoding="utf-8"))
archive = load(doc, FOLDER)

P = lambda n: f"PDF p. {n}"
KAISORI = '§ "Kaisori discovers : The art of Syahi Begar"'
GAATHA_PROCESS = '§ "process:"'
KIND_CARVING = '§ "Woodblock Carving"'
KIND_PRINTING = '§ "Printing"'


def ev(sid, locator, start, end):
    return {"source_id": sid, "locator": locator, "quote": cut(archive, sid, locator, start, end)}


CLAIMS = {
    ("bagru.tradition.bagru-hand-block-print", 1): {"add": [ev("S1", P(2), "Tumers locally known", "using dried wood of plants")]},
    ("bagru.tradition.bagru-hand-block-print", 3): {
        "drop": ["Red and Black. Black colour"],
        "add": [
            ev("S1", P(14), "Traditional Bagru llarrd Block Prints are of two colours", "Red and Black."),
            ev("S1", P(14), "The ground colour of Bagru", "mostly off white (cream)."),
            ev("S7", KAISORI, "Syahi Begar, is a traditional block printing technique", "from Bagru"),
            ev("S7", KAISORI, "Syahi or black is the color", "Begar or the red color"),
        ],
    },
    ("bagru.historical_context.chhipa-community", 0): {
        "add": [
            ev("S1", P(6), "The study carried out by B.C. Mohanty", "According to the authors"),
            ev("S1", P(7), "B.C. Mohanty and J.P. Mohanty, Calico Mseum", "India 1983)"),
        ],
    },
    ("bagru.historical_context.historical-records", 0): {
        "text": "The GI dossier quotes the Imperial Gazetteer of India (Rajputana, 1908) on Bagru as a small town on the Agra-Ajmer road, and cites Dr G.N. Sharma as saying Bagru was famous for its dyed or printed chintzes.",
        "drop": ["9.255-256"],
        "add": [
            ev("S1", P(5), "Bagru was a small town in Rajputana", "Agra-Ajmer Road"),
            ev("S1", P(5), "'IMPERIAL GAZETTEER OF INDIA", "RAJPUTANA, 1908)."),
        ],
    },
    ("bagru.historical_context.community-clientele", 2): {
        "text": "Traditional goods listed include fadat, lugdi, dhabli, angochha, tehmat, janani dhoti, chadara and jajam.",
    },
    ("bagru.historical_context.gi-production-area", 1): {
        "text": "Bagru lies 30-35 km from Jaipur on the Jaipur-Ajmer road; the GI dossier places it about 18 miles south-west of Jaipur on the Agra-Ajmer road.",
    },
    ("bagru.historical_context.market-change-and-imitation", 0): {
        "add": [ev("S1", P(16), "Thus there is a need not only to provide protection", "very lirnited geographical area.")],
    },
    ("bagru.material.cotton-fabric", 0): {"add": [ev("S1", P(3), "Grey superfine, mill-", "Lattha or rezi oloth")]},
    ("bagru.material.begar-alum-paste", 2): {
        "drop": ["Dabu is a mud resist mixture", "now treated with Harda"],
        "add": [ev("S7", KAISORI, "Begar or the red color is made", "Babool or Acacia tree.")],
    },
    ("bagru.material.dhawai-flowers", 1): {"add": [ev("S7", KAISORI, "The next step known as Bhatti lagana", "copper vessel")]},
    ("bagru.material.dabu-paste", 2): {"add": [ev("S4", P(4), "It is then strained into liquid paste", "used for printing.")]},
    ("bagru.material.turmeric-pomegranate-yellow", 0): {"add": [ev("S1", P(12), "The dye extractd from turmeric", "is very fugitive")]},
    ("bagru.material.scouring-agents", 0): {"drop": ["Traditionally the artisans used natural colours"]},
    ("bagru.tool.wooden-block", 0): {"add": [ev("S1", P(13), "To the upper side ofthe bunta", "the motif to the cloth.")]},
    ("bagru.tool.wooden-block", 4): {
        "text": "Carvers use teak (sagwaan) where durability and softness are needed and the harder sheesham for intricate motifs, and also rohida; carving one block can take one to two days.",
        "add": [ev("S6", KIND_CARVING, "Sagwaan is favored when durability", "intricate or detailed motifs.")],
    },
    ("bagru.tool.printing-table", 0): {
        "text": "Pathiya is a table used for dabu printing, mostly by older printers and women who cannot stand long, and the printer sits on the floor; mej tables are for regular production, with printers walking around the table.",
        "drop": ["93.3 Toois"],
        "add": [ev("S1", P(13), "used for Dhabu printing", "The printer sits on the floor.")],
    },
    ("bagru.tool.printing-table", 1): {
        "text": "Printing tables have a layer of ply with 20 layers of 'tart' and a sheet of cloth on which the fabric is laid.",
    },
    ("bagru.tool.colour-tray", 1): {"drop": ["Base colour is off white."]},
    ("bagru.tool.colour-tray", 3): {"add": [ev("S5", '§ "Tools & Tech:"', "So, block printers use a wooden tray", "called")]},
    ("bagru.tool.copper-vessel", 0): {"drop": ["Cow dung and watr are mixed"]},
    ("bagru.tool.indigo-vat", 0): {"text": "One account gives the indigo vats as 15 feet deep."},
    ("bagru.tool.indigo-vat", 1): {"text": "Another account gives blues from Indigofera tinctoria held in vats 10 to 12 feet deep."},
    ("bagru.process_stage.hari-sarana-scouring", 0): {"add": [ev("S1", P(9), "Cow dung and watr are mixed together", "ovemight")]},
    ("bagru.process_stage.hari-sarana-scouring", 1): {"add": [ev("S1", P(9), "Generally, this process requires", "3 to 6 days.")]},
    ("bagru.process_stage.chhapai-mordant-printing", 2): {
        "drop": ["The outline of the motif(s)"],
        "add": [ev("S5", GAATHA_PROCESS, "the fabric is stretched out and pinned on a large table and starting with the", "the printer prints the fabric.")],
    },
    ("bagru.process_stage.dhulai-mordant-wash", 0): {"drop": ["Plate No.l Annexure 13"]},
    ("bagru.process_stage.rangai-alizarin-dyeing", 1): {
        "drop": ["Tannic acid attrac8"],
        "add": [ev("S1", P(10), "Dyeing is oarried out in large copper vessels", "heated by wood fue.")],
    },
    ("bagru.process_stage.rangai-alizarin-dyeing", 2): {
        "add": [
            ev("S7", KAISORI, "The next step known as Bhatti lagana", "copper vessel"),
            ev("S7", KAISORI, "It is allowed to dry in the scorching sun", "time to time."),
        ],
    },
    ("bagru.process_stage.dabu-printing", 0): {
        "drop": ["Tannic acid attrac8"],
        "add": [ev("S1", P(11), "It is ipplied with wooden block", "sprinkled over it'")],
    },
    ("bagru.process_stage.neel-rangai-indigo", 1): {"add": [ev("S1", P(11), "This process is repeated till", "is aohieved.")]},
    ("bagru.process_stage.haldi-naspal-putai", 0): {"drop": ["Ia order to get darker indigo blue"]},
    ("bagru.process_stage.final-washing", 0): {
        "drop": ["saw dust is sprinkled over it"],
        "add": [ev("S1", P(12), "The beating ofthe cloth is generally done", "flow of water.")],
    },
    ("bagru.artisan_decision.block-registration-sequence", 1): {"add": [ev("S6", KIND_PRINTING, "The pattern is repeated", "by eye.")]},
    ("bagru.artisan_decision.dyebath-quantity", 0): {"drop": ["An expedenced dyer always unfold"]},
    ("bagru.artisan_decision.dabu-strength-selection", 1): {
        "text": "Three dabu types are distinguished: kaligar (processed only once), dolidar (more gum, withstands about two trips to the dye vats) and gawarbali (oil and gawar seed powder added, for repeated dyeing).",
        "add": [ev("S4", P(5), "There are 3 types of Dabu", "processed only once")],
    },
    ("bagru.design_principle.red-black-palette", 1): {
        "drop": ["Red dyed fabric along with dhaura"],
        "add": [ev("S7", KAISORI, "Syahi or black is the color", "Begar or the red color")],
    },
    ("bagru.design_principle.motif-groups", 1): {"add": [ev("S1", P(14), "Motifs of Bagru Prinb are srnall in size", "srnall in size")]},
    ("bagru.design_principle.motif-groups", 2): {
        "drop": ["Chhota Bel Conclusions", "Different types of motifs"],
        "add": [ev("S4", P(6), "The significant motifs of Bagru prints are", "11. Chhota Bel")],
    },
    ("bagru.outcome.syahi-begar-print", 1): {"add": [ev("S7", KAISORI, "Syahi or black is the color", "Begar or the red color")]},
    ("bagru.outcome.bagru-green", 0): {"drop": ["and saw dust is sprinkled over it"]},
    ("bagru.outcome.bagru-green", 1): {
        "text": "Bagru is known for its green shade, obtained by two traditional methods: indigo dyeing followed by a pomegranate-peel rinse and an alum rinse, or 'potai', a paste of pomegranate peel, turmeric and sesame oil.",
        "add": [ev("S4", P(5), "It is then rinsed in a pre-boiled", "for removing dabu paste.")],
    },
    ("bagru.scientific_mechanism.indigo-air-oxidation", 1): {"add": [ev("S4", P(2), "they could observe no colour", "exposure in open air")]},
    ("bagru.environmental_condition.semi-arid-seasonality", 0): {
        "text": "The GI dossier's census-2001 data for the production centres give an annual rainfall of 56.64 cm and temperatures from 0.5 to about 48 °C.",
        "add": [ev("S1", P(4), "Geographical Data for tlese production centers", "census 2001")],
    },
    ("bagru.environmental_condition.sun-and-open-ground", 2): {"drop": ["Even today large nunrbers"]},
    ("bagru.comparison.bagru-vs-sanganer", 1): {
        "drop": ["As the cloth dries the Bagru print appears."],
        "add": [ev("S4", P(3), "This produces the light ground colour", "always on white ground.")],
    },
    ("bagru.open_question.age-of-tradition", 1): {"drop": ["Thus it is the skill of Chhipas"]},
    ("bagru.open_question.begar-recipe-and-block-names", 3): {
        "text": "A retailer blog calls the black outline block datta and says begar paste fills in the outlines made earlier by rekhi blocks.",
    },
    ("bagru.open_question.gi-date-reporting", 1): {
        "drop": ["Retrieved from"],
        "add": [ev("S8", '§ "Bagru Print GI Tag"', "In 2024, Bagru print was granted", "(GI) tag")],
    },
    ("bagru.open_question.water-quality-claim", 1): {"drop": ["Chalk- Tailoring chalk"]},
}

S1_STEPS = P(9)
RELS = {
    0: {"evidence": [ev("S1", S1_STEPS, "Scouring (Pre processing", "\"Peela Kama''")]},
    1: {"evidence": [ev("S1", P(10), "Tannic acid attrac8 the mordants", "hand wood - block.")]},
    2: {"evidence": [ev("S1", P(10), "The printed ftbric is left for at least", "fiber struoture.")]},
    3: {"evidence": [ev("S1", P(10), "Longer the ageing", "excess mordanb.")]},
    4: {"evidence": [ev("S1", S1_STEPS, "Dyeing or fixing of colours after washing", "\"Ralgai'")]},
    5: {
        "evidence": [ev("S1", S1_STEPS, "Dyeing or fixing of colours after washing", "\"Dhabu Datai\"")],
        "explanation": "The GI step list places resist (dabu) printing after dyeing.",
        "conditions": "Only for cloth going on to resist and indigo work.",
    },
    6: {"evidence": [ev("S1", P(11), "After printing, the fabric is left outside", "indigo tanks.")]},
    7: {"evidence": [ev("S1", P(11), "For tuming the frbrio green", "yellow dyeing")], "explanation": "For green, the indigo-dyed cloth is taken on to yellow dyeing."},
    8: {"evidence": [ev("S1", P(11), "Once the fabric is dyed evenly", "fixing of yellow dye")]},
    9: {"evidence": [ev("S1", P(12), "so that the yellow dye sea in.", "taken out for washing.")], "explanation": "After the yellow dye sets, the cloth is taken out for washing."},
    10: {
        "evidence": [ev("S1", P(9), "Traditionally cow dung was used", "for scouring."), ev("S4", P(3), "Chippas require two days", "with this mixture.")],
        "explanation": "Cow dung (now soap) scours the cloth; one account mixes the cow dung with soda ash and sesame oil.",
    },
    11: {"evidence": [ev("S1", P(9), "The fabric that comes irom mills", "oii and dust.")], "explanation": "The cloth to be scoured comes from the mills or the handloom sector."},
    12: {
        "evidence": [ev("S1", P(9), "This process of sprinkling water", "white and briglrt.")],
        "explanation": "The cloth is wetted and dried in the open, again and again, until it becomes white and bright.",
    },
    13: {
        "evidence": [ev("S1", P(9), "spread on large open grounds.", "more water is sprinkled on them")],
        "explanation": "Scoured cloth is spread on large open grounds and wetted again before it dries.",
    },
    14: {"evidence": [ev("S1", P(10), "'Ilarda' powder is mixed with water", "dried flat on the ground.")]},
    15: {"evidence": [ev("S1", P(10), "Once the fabric is dried, it is folded and beaten", "'harda' powder")]},
    16: {
        "evidence": [ev("S1", P(10), "Washed fabrio is treated with myrobalan", "Tannic acid attrac8 the mordants"), ev("S4", P(3), "Harda has natural Tanic acid", "the printing colour")],
    },
    17: {
        "evidence": [ev("S4", P(3), "giving a yellow tint to the cloth.", "always on white ground."), ev("S5", GAATHA_PROCESS, "The fabric will have a yellowish tint", "once washed.")],
        "explanation": "One account says harda's yellow tint produces the light ground that differentiates Bagru from Sanganer.",
    },
    18: {"evidence": [ev("S1", P(10), "Usually ferrous is printed", "('rekh).")]},
    19: {"evidence": [ev("S1", P(10), "it is easy for another printer", "with heggar")], "explanation": "Begar is printed with the filler block."},
    20: {"evidence": [ev("S1", P(10), "The block is pressed on to rhis pad", "on to the frbric.")]},
    21: {
        "evidence": [ev("S1", P(10), "A piece of ftbric is spread over a low bench", "heavy cloth."), ev("S4", P(4), "These tables have a layer of ply", "a sheet of cloth")],
    },
    22: {"evidence": [ev("S1", P(10), "lnside this vessel is thick cloth pad", "on to rhis pad")]},
    23: {
        "evidence": [ev("S1", P(10), "As it immediately shows a black impression", "with heggar"), ev("S6", KIND_CARVING, "A Chhipa printer decides how many blocks", "in the print design.")],
    },
    24: {"evidence": [ev("S1", P(10), "As it immediately shows a black impression", "with heggar")]},
    25: {"evidence": [ev("S1", P(10), "The taruric acid of myrcbalam", "ferrous (syahee)")], "explanation": "Myrobalan's tannic acid forms black with the ferrous syahi."},
    26: {"evidence": [ev("S1", P(13), "Syahi in combination with harda", "deep black colour."), ev("S4", P(6), "This paste when applied on harda treated fabric", "exposure to the air.")]},
    27: {
        "evidence": [ev("S1", S1_STEPS, "Drying of printed hbric or Ageing", "in natural dye"), ev("S7", KAISORI, "This fabric is left out to dry in the sun", "gum from Begar.")],
    },
    28: {"evidence": [ev("S1", P(10), "The printed 6bric is washed in nuuring water", "excess mordanb."), ev("S4", P(4), "Almost every stage requires", "dried in sunlight.")]},
    29: {"evidence": [ev("S1", P(10), "Alizarin is filled in small cloft-bags", "dippd in the vessel.")]},
    30: {"evidence": [ev("S1", P(10), "'l)hawadi pha>l', a local flower", "patches and staining."), ev("S7", KAISORI, "Red dyed fabric along with dhaura ka phool", "castor or sesame oil.")]},
    31: {"evidence": [ev("S1", P(10), "Dyeing is oarried out in large copper vessels", "heated by wood fue.")]},
    32: {"evidence": [ev("S1", P(10), "The quantity of alizarin dye is calculated", "expenenced dyet")]},
    33: {"evidence": [ev("S1", P(10), "Dyeing is a process in which the dye reacts", "on tle same print")]},
    34: {"evidence": [ev("S1", P(10), "The colours obtained in conjunction", "(wit} ferrous).")], "explanation": "The dye gives red with the alum mordant and black with the ferrous mordant."},
    35: {"evidence": [ev("S1", P(13), "Begar Paste: - This is the mordant alum", "rich red colour.")], "explanation": "Begar, the alum mordant, develops a rich red with alizarin."},
    36: {"evidence": [ev("S1", P(10), "The colours obtained in conjunction", "(wit} ferrous)."), ev("S7", KAISORI, "Syahi or black is the color", "Begar or the red color")]},
    37: {"evidence": [ev("S1", P(11), "It is ipplied with wooden block", "sprinkled over it'")]},
    38: {"evidence": [ev("S1", P(11), "It is ipplied with wooden block", "sprinkled over it'"), ev("S4", P(5), "As Dabu printing is completed", "dries completely")]},
    39: {"evidence": [ev("S1", P(13), "Pathiya", "used for Dhabu printing")], "explanation": "The pathiya table is used for dabu printing."},
    40: {"evidence": [ev("S1", P(11), "After printing, the fabric is left outside", "indigo tanks.")]},
    41: {"evidence": [ev("S1", P(13), "These are mixed in specific ratios", "Dabu paste needed."), ev("S4", P(5), "There are 3 types of Dabu", "the colour required")]},
    42: {"evidence": [ev("S1", P(11), "Dhabu aca as mechanical resist", "covered wilh 'dhabu''")]},
    43: {"evidence": [ev("S1", P(11), "Dhabu aca as mechanical resist", "covered wilh 'dhabu''")], "explanation": "Dabu acts as a mechanical resist that keeps dye out of the areas it covers."},
    44: {"evidence": [ev("S1", P(11), "The printed cloth is folded neatly", "into the indigo tank.")], "explanation": "The printed cloth is lowered into the indigo tank."},
    45: {"evidence": [ev("S1", P(11), "The printed cloth is folded neatly", "into the indigo tank."), ev("S4", P(6), "this solution along with lime is dissolved", "15 feet deep")]},
    46: {"evidence": [ev("S1", P(11), "An expert indigo dyer can tell", "colour of the vat.")]},
    47: {"evidence": [ev("S1", P(11), "An expedenced dyer always unfold", "' Dhabu '.")]},
    48: {"evidence": [ev("S1", P(11), "The frbric is then taken out oftank", "atmospheric oxygen"), ev("S4", P(2), "they could observe no colour", "exposure in open air")]},
    49: {"evidence": [ev("S1", P(11), "opened out to react with the atmospheric oxygen", "oxidized indigo.")], "explanation": "Out of the vat, the reduced indigo turns into oxidised indigo in the air."},
    50: {"evidence": [ev("S1", P(11), "This iechnique is used only", "indigo blue."), ev("S6", KIND_PRINTING, "The motifs made with the mud resist", "fabric is dyed.")]},
    51: {
        "evidence": [ev("S1", P(11), "fifth person dips a loose-woven woolen fabrio", "(pomegranate rinds)"), ev("S4", P(5), "In this process, a paste is made", "sesame oil.")],
        "explanation": "Turmeric-pomegranate yellow is rubbed on with a loose-woven cloth.",
    },
    52: {"evidence": [ev("S1", P(11), "The frbric is again printed with dhabu", "in an open area.")]},
    53: {"evidence": [ev("S1", P(12), "the ftbric is dipped in a big copper vessel", "diluted alum.")]},
    54: {"evidence": [ev("S1", P(12), "After leaving it for a few minutes", "to come ofi)")]},
    55: {"evidence": [ev("S1", P(12), "The dye extractd from turmeric", "done with alum")]},
    56: {"evidence": [ev("S1", P(12), "The dye extractd from turmeric", "done with alum")], "explanation": "Alum post-mordanting makes the fugitive yellow fast."},
    57: {"evidence": [ev("S1", P(11), "For tuming the frbrio green", "yellow dyeing"), ev("S4", P(5), "Bagru is known for its green shade", "two traditional methods")]},
    58: {
        "evidence": [ev("S1", P(13), "A wooden mallet used in some cases", "finished cloth pieces.")],
        "explanation": "A wooden mallet (mogri) is used in some cases to beat the folds of the moist finished cloth.",
    },
    59: {"evidence": [ev("S1", P(12), "The beating ofthe cloth is generally done", "flow of water.")]},
    61: {"evidence": [ev("S1", P(14), "The skill for produotion", "Chhipas ofBagru.")]},
    62: {"evidence": [ev("S1", P(2), "Tumers locally known as Kharadiyes", "producing desired blocks"), ev("S9", '§ "Titanwala Sangrahalaya"', "the art of wooden block-making", "Kharaodi community")]},
    63: {"evidence": [ev("S1", P(13), "steel chisels of different widths", "wooden printing blocks.")]},
    64: {
        "evidence": [ev("S1", P(7), "They perhaps came for", "dyeing and printing."), ev("S4", P(3), "The presence of abundant water", "settlement of the Chippas.")],
    },
    65: {"evidence": [ev("S1", P(4), "Geographical fueas of production", "JAIRAMPURA-"), ev("S2", '§ "Application Details"', "Application Number 183", "Status Registered")]},
    66: {"evidence": [ev("S1", P(5), "Bagru, an early l6th oentrrry town", "Textile pr&ucbon Celrter"), ev("S10", '§ "Textile"', "Bagru Period 19th Century", "Mid to Late 19th Century")]},
    67: {"evidence": [ev("S1", P(5), "Their limited design and colour range", "end uses of the area.")]},
    68: {"evidence": [ev("S1", P(16), "Fake (screm printe/) Bagru Textiles", "Block Print."), ev("S3", P(5), "craftsmen have adopted cheaper", "chemical dyes in abundance")]},
    69: {"evidence": [ev("S1", P(14), "Traditional Bagru llarrd Block Prints are of two colours", "Red and Black."), ev("S7", KAISORI, "Syahi or black is the color", "Begar or the red color")]},
    70: {
        "evidence": [ev("S5", '§ "Design:"', "The number of blocks per design depends", "the design will have."), ev("S6", KIND_CARVING, "On average, a printer will need", "hand printed cloth.")],
        "explanation": "The number of blocks a design needs depends on its colours and shapes; a cloth needs at least 4 or 5.",
    },
    71: {"evidence": [ev("S1", P(2), "Traditional lvlotifs ofBagru Print are one ofthe following five", "grcups")], "explanation": "The GI specification gives the five motif groups of traditional Bagru prints."},
    72: {"evidence": [ev("S6", '§ "Place: The Final Process"', "Those rains haven't been as plentiful", "in the village.")]},
    73: {"evidence": [ev("S1", P(8), "in the Sanganeri Print the background", "off white or ftwn."), ev("S4", P(3), "This produces the light ground colour", "always on white ground.")]},
    74: {
        "evidence": [
            ev("S1", P(7), "came from Sawai", "300 years ago."),
            ev("S4", P(2), "There is no authentic record", "block printing practices"),
            ev("S5", '§ "History:" (occurrence 1 of 2)', "It is estimated that this art form was introduced", "450 years back"),
            ev("S6", "§ \"Profile: Bagru Textiles' Indian Blockprints\"", "For at least 400 years", "home to the Chhipa"),
        ],
    },
    75: {
        "evidence": [
            ev("S1", P(13), "Begar Paste: - This is the mordant alum", "rich red colour."),
            ev("S4", P(6), "For making the red outline", "to make a paste."),
            ev("S5", GAATHA_PROCESS, "Red: A mixture of natural gum paste", "and alum."),
            ev("S7", KAISORI, "Begar or the red color is made", "Babool or Acacia tree."),
        ],
    },
    76: {
        "evidence": [ev("S1", P(14), "Locally awailable water has excellent properties", "dyeing and printing."), ev("S5", '§ "Usage:"', "Characterized by the sheen", "Sanjara River")],
        "explanation": "Records the sources' statements that the local water suits dyeing and printing and gives the finished cloth its sheen.",
    },
    77: {"evidence": [ev("S6", KIND_PRINTING, "The abundance of empty spaces", "unintentional dye drips")]},
    78: {
        "source_ids": ["S6"],
        "evidence": [ev("S6", '§ "Place: The Final Process"', "During the hot and dry months", "brings work to a halt.")],
        "explanation": "Production follows the seasons: cloth is dried in courtyards in the hot dry months, and the monsoon halts work.",
    },
}
REMOVE_RELS = {
    60: "No recorded source ties groundwater pollution to the final washing: the GI dossier says only that effluent is aerated before discharge, and Gaatha attributes the pollution to chemicals in the process water in general (bagru-verification.md, DR-120).",
}


def matches(e, prefixes):
    return any(e["quote"].startswith(p) for p in prefixes)


by_key = {c["key"]: c for c in doc["concepts"]}
for (key, i), change in CLAIMS.items():
    cl = by_key[key]["claims"][i]
    if "text" in change:
        cl["text"] = change["text"]
    drops = change.get("drop", [])
    before = len(cl["evidence"])
    cl["evidence"] = [e for e in cl["evidence"] if not matches(e, drops)]
    if before - len(cl["evidence"]) != len(drops):
        sys.exit(f"{key} C{i}: expected to drop {len(drops)} passages, dropped {before - len(cl['evidence'])}")
    have = {(e["source_id"], e["locator"], e["quote"]) for e in cl["evidence"]}
    cl["evidence"] += [e for e in change.get("add", []) if (e["source_id"], e["locator"], e["quote"]) not in have]

for i, change in RELS.items():
    r = doc["relationships"][i]
    for field in ("source_ids", "explanation", "conditions"):
        if field in change:
            r[field] = change[field]
    r["evidence"] = change["evidence"]
    for e in r["evidence"]:
        if len(e["quote"].split()) > 25:
            sys.exit(f"relationship {i}: passage over 25 words: {e['quote']}")
    if sorted({e["source_id"] for e in r["evidence"]}) != sorted(set(r["source_ids"])):
        sys.exit(f"relationship {i}: passages {[e['source_id'] for e in r['evidence']]} do not cover sources {r['source_ids']}")

removed = json.load(open(REMOVED, encoding="utf-8"))
for i in sorted(REMOVE_RELS, reverse=True):
    r = doc["relationships"].pop(i)
    removed.append({"file": "traditions/bagru/tradition.json", **r, "removal_reason": REMOVE_RELS[i]})

missing = [i for i, r in enumerate(doc["relationships"]) if not r.get("evidence")]
if missing:
    sys.exit(f"relationships without passages: {missing}")

for c in doc["concepts"]:
    c["verification_state"] = "verified"
    c["summary"] = c["claims"][0]["text"]
    c["body_md"] = "\n\n".join(f"{cl['text']} [{', '.join(cl['source_ids'])}]" for cl in c["claims"])
for r in doc["relationships"]:
    r["verification_state"] = "verified"

open(PATH, "w", encoding="utf-8", newline="\n").write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
open(REMOVED, "w", encoding="utf-8", newline="\n").write(json.dumps(removed, ensure_ascii=False, indent=2) + "\n")
print("claims changed:", len(CLAIMS), "relationships with passages:", len(doc["relationships"]), "removed:", len(REMOVE_RELS))
