const fs = require('fs');

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    const targetRegex = /const globalNotificationChannel = supabase\.channel\('global_notifications'\)[\s\S]*?\}\);[\s\S]*?\}\)\.subscribe\(\)/g;

    const replacement = `const globalNotificationChannel = supabase.channel('global_notifications')
      .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages', 
        filter: "direction=eq.inbound" 
      }, 
      (payload) => {
        const newMsg = payload.new;
        const isLookingAtDifferentTab = document.hidden;

        // SECURE CHECK: Only notify if the lead actually belongs to this user/tenant's loaded leads
        setLeads((currentLeads) => {
            const belongsToAgent = currentLeads.find(l => l.id === newMsg.lead_id);
            
            if (belongsToAgent) {
                setSelectedLead((currentSelectedLead) => {
                    const isLookingAtDifferentChat = currentSelectedLead?.id !== newMsg.lead_id;
                    
                    if (isLookingAtDifferentTab || isLookingAtDifferentChat) {
                        playNotificationSound();
                        showLocalNotification(\`Message from \${belongsToAgent.name}\`, {
                           body: newMsg.content ? newMsg.content.substring(0, 50) + "..." : "You received a new message.",
                           icon: "/favicon.ico"
                        });
                    }
                    return currentSelectedLead; 
                });
            }
            return currentLeads;
        });

      }).subscribe()`;

    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patched", filePath);
}

patchFile('app/telecaller/chat/page.tsx');
patchFile('app/admin/whatsapp/page.tsx');
