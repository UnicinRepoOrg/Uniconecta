"""Envio em ondas por proximidade (CEP / bairro). Funções puras, sem AWS.

Níveis (do mais próximo para o mais longe):
  0  mesmo CEP (8 dígitos): mesmo condomínio ou rua
  1  mesmos 5 primeiros dígitos (setor) ou mesmo bairro normalizado
  2  mesmos 4 primeiros dígitos
  3  mesmos 3 primeiros dígitos
  4  resto da rede (inclui quem não tem CEP)

Cada onda junta níveis consecutivos até ter pelo menos `min_size` pessoas;
níveis vazios são pulados. A última onda sempre completa a rede toda.
"""
import re
import unicodedata

LEVELS = 5


def cep_digits(value):
    """'30140-071' -> '30140071'; qualquer coisa sem 8 dígitos -> None."""
    digits = re.sub(r'\D', '', str(value or ''))
    return digits if len(digits) == 8 else None


def bairro_key(value):
    """'  Sto. Agostinho ' e 'santo  agostinho' ficam comparáveis: sem acento,
    minúsculas, só letras/números e um espaço entre palavras."""
    text = unicodedata.normalize('NFKD', str(value or ''))
    text = ''.join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r'[^a-z0-9]+', ' ', text).strip()
    text = re.sub(r'^(sto|sta)\b', lambda m: 'santo' if m.group(1) == 'sto' else 'santa', text)
    return text or None


def proximity_level(requester, member):
    """Nível de proximidade (0 a 4) entre dois cadastros (dicts com 'cep' e 'bairro')."""
    rc, mc = cep_digits(requester.get('cep')), cep_digits(member.get('cep'))
    rb, mb = bairro_key(requester.get('bairro')), bairro_key(member.get('bairro'))
    if rc and mc and rc == mc:
        return 0
    if (rc and mc and rc[:5] == mc[:5]) or (rb and rb == mb):
        return 1
    if rc and mc and rc[:4] == mc[:4]:
        return 2
    if rc and mc and rc[:3] == mc[:3]:
        return 3
    return 4


def build_waves(requester, members, min_size=3, broadcast=False):
    """Divide a rede em ondas. `members` são dicts com 'id', 'to', 'cep', 'bairro'.
    Devolve [[{'id', 'to'}, ...], ...]; com broadcast=True, uma onda só."""
    recipients = [(m, {'id': m['id'], 'to': m['to']}) for m in members]
    if broadcast:
        return [[r for _, r in recipients]] if recipients else []

    by_level = [[] for _ in range(LEVELS)]
    for member, recipient in recipients:
        by_level[proximity_level(requester, member)].append(recipient)

    waves, current = [], []
    for level, group in enumerate(by_level):
        current += group
        if current and (len(current) >= min_size or level == LEVELS - 1):
            waves.append(current)
            current = []
    return waves
