// The passwords people actually choose, so a bad one can be refused by
// name rather than with a rule about symbols.
//
// This is the top of every breach list that has ever been published,
// trimmed to what is plausible on a studio login and stripped of the
// digits people add to the end, because "password123" and "password"
// are the same choice. It is short on purpose: a list of ten million
// would need a file and a lookup, and the value is almost all in the
// first few hundred - past that, length is doing the work.
export const COMMON_PASSWORDS = new Set([
  "password", "passwort", "passw", "pass", "secret", "letmein", "welcome", "monkey", "dragon",
  "master", "shadow", "qwerty", "qwertyuiop", "qwertz", "azerty", "asdf", "asdfgh", "asdfghjkl",
  "zxcvbn", "zxcvbnm", "abc", "abcd", "abcabc", "iloveyou", "princess", "sunshine", "football",
  "baseball", "basketball", "superman", "batman", "starwars", "pokemon", "trustno", "whatever",
  "freedom", "computer", "internet", "hello", "helloworld", "test", "testing", "temp", "temporary",
  "changeme", "default", "root", "toor", "admin", "administrator", "adminadmin", "adminpassword",
  "user", "guest", "login", "access", "system", "server", "docker", "ubuntu", "debian", "raspberry",
  "raspberrypi", "linux", "windows", "michael", "jennifer", "jordan", "thomas", "charlie", "daniel",
  "hunter", "harley", "ranger", "buster", "soccer", "tigger", "purple", "silver", "orange", "yellow",
  "cheese", "chocolate", "flower", "summer", "winter", "spring", "autumn", "london", "liverpool",
  "arsenal", "chelsea", "manchester", "england", "scotland", "ireland", "wales", "fossstudio",
  "fosscast", "studio", "podcast", "recording", "microphone", "camera", "session", "mypassword",
  "yourpassword", "newpassword", "oldpassword", "passwordpassword", "correcthorsebatterystaple",
  "trustme", "nopassword", "nothing", "anything", "something", "somethingelse", "qazwsx", "qweasd",
  "qwe", "qweqwe", "aaa", "abcdef", "abcdefg", "abcdefgh", "abcdefghij", "google", "facebook",
  "twitter", "youtube", "amazon", "netflix", "spotify", "apple", "samsung", "android", "iphone"
]);
