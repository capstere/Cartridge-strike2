export function networkEndpoint(endpoint=globalThis.location?.origin,origin=globalThis.location?.origin) {
  let url;try{url=new URL(endpoint);}catch{throw Error('Öppna spelet från Pi-serverns fullständiga adress.');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Spel och server måste ha samma adress. Öppna http://PI-ADRESS:2567/fps/?network=lan på båda enheterna.');
  return url.origin;
}
export function connectionMessage(error) {
  const message=String(error?.message||error||'');
  if(/Incorrect private|AUTH_FAILED/.test(message))return 'Fel privat rumskod. Kontrollera koden med den andra spelaren.';
  if(/full|locked/i.test(message))return 'Rummet är fullt (2 spelare). Vänta tills någon lämnar.';
  if(/not found|not defined|invalid room|does not exist/i.test(message))return 'Rummet finns inte längre. Kontrollera rums-ID eller skapa ett nytt rum.';
  if(/Incompatible|mismatch|version/i.test(message))return 'Klient och server har olika version. Ladda om sidan på båda enheterna efter serveruppdateringen.';
  if(error?.code===429||/Too many|room limit/i.test(message))return 'För många anslutningsförsök eller rum. Vänta en stund och försök igen.';
  if(/private code|Invalid room options/i.test(message))return 'Använd en kod med 6–64 bokstäver, siffror eller bindestreck och ett kort namn.';
  if(error?.code===403||/Origin|Host/.test(message))return 'Servern avvisade adressen. Öppna spelet direkt från Pi-serverns angivna LAN-adress.';
  if(/fetch|network|ECONN|timeout|ready|aborted/i.test(message))return 'Ingen kontakt med servern. Kontrollera samma Wi-Fi/LAN, Pi-adressen och att tjänsten körs. Försök sedan igen.';
  return message||'Anslutningen misslyckades. Försök igen.';
}
