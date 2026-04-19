/**
 * Sequenced omens. Each visitor sees these in order, one per PST day.
 * Order is intentional: an arc from welcome to craft to self-recognition to return.
 * Tone: warm, specific, Persian-wisdom-adjacent without being cliché.
 * Rules: under 25 words each, no em-dashes, confident not preachy.
 */

const OMENS = [
  "Welcome. The fact that you are here means something, even if neither of us knows what yet.",
  "You are more capable today than you were last year. Let that be the premise, not the question.",
  "Start before the plan is ready. The plan becomes ready by starting.",
  "What you call a flaw is often just a pronunciation of depth.",
  "Your attention is the most generous thing you give anyone today.",
  "The one you are avoiding is usually the one worth doing.",
  "Small things done for a long time become the thing you are known for.",
  "What feels ordinary to you is rare to someone else. Guard that instinct.",
  "The best version of today is the one where you made one thing slightly better.",
  "You are allowed to be new at something after ten years of being good at another.",
  "Being wrong quickly is a form of intelligence. Try it on a small thing today.",
  "Your future boss is watching the thing you do on a Tuesday, not the thing you pitch on a stage.",
  "Say the harder thing with a softer voice.",
  "Most people will never notice. The ones who do are the ones who matter.",
  "Rest is strategy. So is not rushing.",
  "The call you have been putting off will take eight minutes and change a week.",
  "You are not behind. You are in a different story.",
  "Be specific. Vagueness is where everything interesting goes to die.",
  "Ship the eighty percent today. The last twenty teaches you more than waiting ever will.",
  "Trust small data, especially about yourself.",
  "The reason you care so much is also the reason you are good at it.",
  "A rough draft is not a weak draft. It is a draft with courage.",
  "Choose the work that makes you slightly more specific.",
  "The universe quietly respects whoever commits first.",
  "You are more patient than you were at twenty-five. Let that be enough, sometimes.",
  "The best compliment is attention that does not need to be acknowledged.",
  "Not every fire needs putting out. Some just warm the room.",
  "You can be rigorous and kind. Most people do not know this is allowed.",
  "Write the thing down. Memory is for small things. Pen is for important ones.",
  "Nobody is watching. Do it for the version of you who will be.",
  "The craft always outlives the title.",
  "Tell someone you are proud of them today. Do it badly if you must.",
  "Ten minutes of real work beats two hours of planning how to work.",
  "Every person you admire kept going one step past the polite stopping point.",
  "The thing that sounds naive when you say it today will sound obvious in five years.",
  "You owe your twenty-two-year-old self one small act of the dream, today.",
  "Confidence is just familiarity with being new.",
  "Do less. Do it longer.",
  "Pay attention to what you defend. That is where you actually live.",
  "Take one thing off the list by deciding it is already enough.",
  "The project that survives a hundred small days is the one that wins.",
  "What you tolerate, you teach. What you admire, you become.",
  "Your question today is better than yesterday's answer.",
  "A deadline is a promise to your future self. Honor it like a friend.",
  "The people who doubted you are not the audience. Keep walking.",
  "What you make is how you metabolize what you read.",
  "If the work made you slightly bolder, the work was good.",
  "There is a person whose week will be quietly better because of something small you do today.",
  "Be suspicious of advice that sounds too clean to have been earned.",
  "You came back. That, too, is a kind of courage. See you tomorrow."
];

module.exports = { OMENS, TOTAL: OMENS.length };
