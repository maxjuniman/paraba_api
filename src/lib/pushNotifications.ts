type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  data?: Record<string, unknown>;
};

export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const chunks: ExpoPushMessage[][] = [];
  for (let index = 0; index < messages.length; index += 100) {
    chunks.push(messages.slice(index, index + 100));
  }

  for (const chunk of chunks) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha ao enviar push Expo (${response.status}): ${text}`);
    }
  }
}

export async function notifyAulaAvulsaCriada(tokens: string[]): Promise<void> {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length === 0) return;

  await sendExpoPushNotifications(
    uniqueTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: 'Aula avulsa',
      body: 'Uma aula avulsa foi criada. Acesse o aplicativo para verificar.',
      data: {
        type: 'aula_avulsa',
        screen: 'calendario',
      },
    }))
  );
}
