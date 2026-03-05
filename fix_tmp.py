import re, pathlib
p = pathlib.Path('server/whatsapp.ts')
text = p.read_text(encoding='utf-8')
pat = re.compile(r // SOLU.*?// Extract message data including media, re.S)
new = '''  // SOLUÇÃO BAILEYS 2025: Usar jidDecode para extrair número real limpo,
  // mas com fallback robusto para garantir que sempre usamos o telefone do contato.
  const decoded = jidDecode(remoteJid);
  
  let rawUser = decoded?.user || ;
 let jidSuffix = decoded?.server || s.whatsapp.net; // s.whatsapp.net ou lid
 
 // Fallback: se o decode trouxer vazio/curto, usar o remoteJid original (comportamento do backup)
 if (!rawUser || rawUser.length < 10) {
 const parts = remoteJid.split(@);
 rawUser = parts[0] || ;
    jidSuffix = parts[1] || s.whatsapp.net;
  }

  // Normaliza: remove sufixo :device e qualquer caractere não numérico
  const contactNumber = rawUser.split(:)[0].replace(/\D/g, );

 if (!contactNumber) {
 console.log([WhatsApp] Could not parse number from JID: );
 return;
 }
 
 console.log([WhatsApp] Parsed JID: );
 console.log([WhatsApp] -> number: );
 console.log([WhatsApp] -> server: );
 console.log([WhatsApp] -> device: );
 
 // Ignorar mensagens do próprio número conectado
 if (session.phoneNumber && contactNumber === session.phoneNumber) {
 console.log(Ignoring message from own number: );
 return;
 }

 // Extract message data including media'''
new_text, n = pat.subn(new, text)
if n == 0:
 raise SystemExit('pattern not found')
p.write_text(new_text, encoding='utf-8')
print('patched', n)
