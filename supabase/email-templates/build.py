import json
LOGO="https://app.foodporter.nl/brand/logo-lockup.png"
def page(title_nl, body_nl, btn_nl, title_en, body_en, btn_en, code=False):
    if code:
        action = '<tr><td align="center" style="padding:8px 0 20px"><div style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:6px;font-weight:bold;color:#9b0708;background:#fff6cc;border:2px solid #fad228;border-radius:10px;padding:12px 22px">{{ .Token }}</div></td></tr>'
        fb = ''
    else:
        action = ('<tr><td align="center" style="padding:8px 0 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
          '<td align="center" bgcolor="#9b0708" style="border-radius:10px;border-bottom:3px solid #fad228"><a href="{{ .ConfirmationURL }}" target="_blank" '
          'style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">'
          + btn_nl + ' / ' + btn_en + '</a></td></tr></table></td></tr>')
        fb = ('<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#5b5f6a;padding:0 0 18px">'
          'Werkt de knop niet? Kopieer deze link in je browser / Button not working? Copy this link into your browser:<br>'
          '<a href="{{ .ConfirmationURL }}" style="color:#9b0708;word-break:break-all">{{ .ConfirmationURL }}</a></td></tr>')
    p = 'style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1d1b24;padding:0 0 12px"'
    h = 'style="font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:28px;font-weight:bold;color:#9b0708;padding:0 0 10px"'
    return f'''<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>{title_nl}</title></head>
<body style="margin:0;padding:0;background:#f5f5f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f6" style="background:#f5f5f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e6e6ea" bgcolor="#ffffff">
<tr><td align="center" bgcolor="#ffffff" style="padding:22px 24px 14px;border-bottom:4px solid #fad228;border-radius:14px 14px 0 0"><img src="{LOGO}" width="180" alt="Food Porter" style="display:block;width:180px;max-width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:24px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td {h}>{title_nl}</td></tr><tr><td {p}>{body_nl}</td></tr>
{action}{fb}
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#5b5f6a;padding:0 0 18px">Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</td></tr>
<tr><td style="border-top:1px solid #e6e6ea;padding:18px 0 0"></td></tr>
<tr><td {h.replace("21px","18px")}>{title_en}</td></tr><tr><td {p}>{body_en}</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#5b5f6a;padding:0 0 18px">Didn't request this? You can safely ignore this email.</td></tr>
</table></td></tr>
<tr><td bgcolor="#9b0708" style="padding:16px 24px;border-radius:0 0 14px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#ffffff;text-align:center">
Sonic Jobs V.O.F. h.o.d.n. Food Porter<br>Amarantstraat 6, 5044 RK Tilburg &middot; KvK 42169998<br>
Vragen? / Questions? <a href="mailto:support@foodporter.nl" style="color:#fad228;text-decoration:underline">support@foodporter.nl</a></td></tr>
</table></td></tr></table></body></html>'''
T={
 "confirmation":("Bevestig je e-mailadres / Confirm your email address", page("Welkom bij Food Porter!","Bevestig je e-mailadres om je account te activeren. Daarna ben je meteen ingelogd.","Bevestigen","Welcome to Food Porter!","Confirm your email address to activate your account. You'll be signed in right away.","Confirm")),
 "recovery":("Wachtwoord opnieuw instellen / Reset your password", page("Wachtwoord opnieuw instellen","We kregen een verzoek om het wachtwoord van je account opnieuw in te stellen. Deze link is 15 minuten geldig.","Nieuw wachtwoord kiezen","Reset your password","We received a request to reset the password for your account. This link is valid for 15 minutes.","Choose new password")),
 "magic_link":("Je inloglink / Your sign-in link", page("Je inloglink","Klik op de knop om in te loggen bij Food Porter. Deze link is 15 minuten geldig en werkt één keer.","Inloggen","Your sign-in link","Click the button to sign in to Food Porter. This link is valid for 15 minutes and works once.","Sign in")),
 "email_change":("Bevestig je nieuwe e-mailadres / Confirm your new email address", page("Bevestig je nieuwe e-mailadres","Je wilt je e-mailadres wijzigen van {{ .Email }} naar {{ .NewEmail }}. Bevestig dit met de knop hieronder.","Wijziging bevestigen","Confirm your new email address","You asked to change your email address from {{ .Email }} to {{ .NewEmail }}. Confirm this with the button below.","Confirm change")),
 "invite":("Je bent uitgenodigd voor Food Porter / You've been invited to Food Porter", page("Je bent uitgenodigd","Je bent uitgenodigd om een account aan te maken bij Food Porter. Klik op de knop om de uitnodiging te accepteren.","Uitnodiging accepteren","You've been invited","You've been invited to create a Food Porter account. Click the button to accept the invitation.","Accept invitation")),
 "reauthentication":("Je verificatiecode / Your verification code", page("Je verificatiecode","Gebruik deze code om te bevestigen dat jij het bent. De code is 15 minuten geldig.","","Your verification code","Use this code to confirm it's you. The code is valid for 15 minutes.","",code=True)),
}
body={}
for k,(s,c) in T.items():
    body[f"mailer_subjects_{k}"]=s; body[f"mailer_templates_{k}_content"]=c
    open(f"{k}.html","w").write(c)
json.dump(body,open("payload.json","w"))
