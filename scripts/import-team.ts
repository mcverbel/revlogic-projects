/** One-off: add revlogic teammates by email so they can be added to engagements and assigned tasks before they sign in. Safe to re-run. */
import "dotenv/config";
import { db } from "../src/db";
import { users } from "../src/db/schema";

const TEAM = `Adrian Vidal,adrian.vidal@rev-logic.com
Al Tier,al.tier@rev-logic.com
Alexandria Young,lexie.young@rev-logic.com
Amanda Smith,amanda.smith@rev-logic.com
Ashley Weston,ashley.weston@rev-logic.com
Avtar Varma,avtar.varma@rev-logic.com
Bailey McCoskey,bailey.mccoskey@rev-logic.com
Brett Languirand,brett.languirand@rev-logic.com
Brian Nzau,brian.nzau@rev-logic.com
Brooke Parrales,brooke@rev-logic.com
Cara Holt,cara.holt@rev-logic.com
Charles Garnes,charles.garnes@rev-logic.com
Charlotte Pearson,charlotte.pearson@rev-logic.com
Chris McClintock,chris.mcclintock@rev-logic.com
Christopher Platt,christopher.platt@rev-logic.com
Cody Kocherhans,cody.kocherhans@rev-logic.com
Cyrus Twaddle,cyrus.twaddle@rev-logic.com
Dannii Mathers,dannii.mathers@rev-logic.com
Devin Williams,devin.williams@rev-logic.com
Elizabeth Starkey,elizabeth.starkey@rev-logic.com
Emily Miller,emily@rev-logic.com
Eric Ranke,eric.ranke@rev-logic.com
Erika Hernandez,erika.hernandez@rev-logic.com
Fenil Parekh,fenil.parekh@rev-logic.com
Gabe Capa,gabe.capa@rev-logic.com
Gigi Goodall,gigi.goodall@rev-logic.com
Gracy McGuigan,gracy@rev-logic.com
Hana Courtelis,hana.courtelis@rev-logic.com
Hannah Davis,hannah@rev-logic.com
Heff Houchin,heff.houchin@rev-logic.com
Jake McDonough,jake.mcdonough@rev-logic.com
Jesse Potter,jesse.potter@rev-logic.com
Jesse Hartline,jesse.hartline@rev-logic.com
Jessica Shugart,jessica@rev-logic.com
Josh Ruff,josh.ruff@rev-logic.com
Kayla Hinson,kayla.hinson@rev-logic.com
Kelly Wagner,kelly@rev-logic.com
Kristen Glover,kristen.glover@rev-logic.com
Laura Braun,laura@rev-logic.com
Lauren Gossett,lauren.gossett@rev-logic.com
Leslie Markley,leslie.markley@rev-logic.com
Lindsay Zausmer,lindsay.zausmer@rev-logic.com
Lindsay Sneyd,lindsay@rev-logic.com
Maria Verbel,maria@rev-logic.com
Matt Houchin,matt@rev-logic.com
Matt Sanders,matt.sanders@rev-logic.com
Megan Allen,megan@rev-logic.com
Meghan Castillo,meghan.castillo@rev-logic.com
Melissa Griffore,melissa@rev-logic.com
Miranda Beckford,miranda.beckford@rev-logic.com
Nick Houchin,nick.houchin@rev-logic.com
Phil Langhout,phil.langhout@rev-logic.com
Rachel Likens,rachel@rev-logic.com
Raph Soeiro,raph.soeiro@rev-logic.com
Rick Kickert,rick@rev-logic.com
Rob Chew,rob@rev-logic.com
Salma Abdalla,salma.abdalla@rev-logic.com
Samantha Crocker,sam.crocker@rev-logic.com
Sandra Strickland,sandra.strickland@rev-logic.com
Sarah Boussy,sarah.boussy@rev-logic.com
Shannon Everett,shannon.everett@rev-logic.com
Sheetal Varma,sheetal.varma@rev-logic.com
Sydney Timmerman,sydney.timmerman@rev-logic.com
Thomas Benning,thomas.benning@rev-logic.com
Tiffany Kummer,tiff@rev-logic.com
Trey Sizemore,trey@rev-logic.com
Vaughn Heaston,vaughn.heaston@rev-logic.com`;

async function main() {
  const rows = TEAM.split("\n").map((l) => { const [name, email] = l.split(","); return { name: name!.trim(), email: email!.trim().toLowerCase(), role: "member" as const }; });
  const added = await db.insert(users).values(rows).onConflictDoNothing({ target: users.email }).returning({ email: users.email });
  console.log(`${rows.length} people in the list · ${added.length} added · ${rows.length - added.length} were already in the app`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
