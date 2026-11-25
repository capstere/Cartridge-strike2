export function networkEndpoint(endpoint=globalThis.location?.origin,origin=globalThis.location?.origin) {
  let url;try{url=new URL(endpoint);}catch{throw Error('Öppna spelet från Pi-serverns fullständiga adress.');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Spel och server måste ha samma adress. Öppna samma speladress på båda enheterna.');
  return url.origin;
}
export function connectionMessage(error) {
  const message=String(error?.message||error||'');
  if(/Incorrect family room password/i.test(message))return 'Fel lösenord till familjerummet. Kontrollera lösenordet du fick.';
  if(/family room .*closed/i.test(message))return 'Öppna den fasta länken till familjerummet igen.';
  if(/family room .*unavailable/i.test(message))return 'Familjerummet är tillfälligt otillgängligt. Försök igen om en stund.';
  if(/Incorrect private|AUTH_FAILED/.test(message))return 'Fel privat rumskod. Kontrollera koden med den andra spelaren.';
  if(/team is full/i.test(message))return 'Laget är fullt (5 spelare). Välj det andra laget eller automatisk lagfördelning.';
  if(/full|locked/i.test(message))return 'Rummet är fullt (10 spelare). Vänta tills någon lämnar.';
  if(/not found|not defined|invalid room|does not exist/i.test(message))return 'Rummet finns inte längre. Kontrollera rums-ID eller skapa ett nytt rum.';
  if(/Incompatible|mismatch|version/i.test(message))return 'Klient och server har olika version. Ladda om sidan på båda enheterna efter serveruppdateringen.';
  if(error?.code===429||/Too many|room limit/i.test(message))return 'För många anslutningsförsök eller rum. Vänta en stund och försök igen.';
  if(/private code|Invalid room options/i.test(message))return 'Använd en kod med 6–64 bokstäver, siffror eller bindestreck och ett kort namn.';
  if(error?.code===401||/pilot invite|pilot access|invitation required/i.test(message))return 'Din serverinbjudan har gått ut. Ladda om sidan och ange inbjudningskoden igen.';
  if(error?.code===403||/Origin|Host/.test(message))return 'Servern avvisade adressen. Öppna spelet direkt från den delade serveradressen.';
  if(/fetch|network|ECONN|timeout|ready|aborted/i.test(message))return 'Ingen kontakt med servern. Kontrollera uppkopplingen, serveradressen och att tjänsten körs. Försök sedan igen.';
  return message||'Anslutningen misslyckades. Försök igen.';
}
