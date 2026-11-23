import { Router } from 'express';
import { z } from 'zod';
import { listActivePushTokens } from '../lib/db.js';
import { notifyBroadcast } from '../lib/pushNotifications.js';
import { authRequired } from '../middleware/authRequired.js';
import { requireProfessor } from '../middleware/requireProfessor.js';

export const notificationsRoutes = Router();

notificationsRoutes.use(authRequired, requireProfessor);

const broadcastSchema = z.object({
  titulo: z.string().trim().min(1, 'Informe o titulo.').max(80, 'Titulo muito longo.'),
  mensagem: z.string().trim().min(1, 'Informe a mensagem.').max(400, 'Mensagem muito longa.'),
});

notificationsRoutes.post('/broadcast', async (req, res, next) => {
  try {
    const parsed = broadcastSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    const tokens = await listActivePushTokens();
    const enviados = await notifyBroadcast(tokens, parsed.data.titulo, parsed.data.mensagem);

    res.json({
      data: {
        enviados,
        message:
          enviados === 0
            ? 'Nenhum aparelho com notificacao ativa no momento.'
            : `Notificacao enviada para ${enviados} aparelho${enviados === 1 ? '' : 's'}.`,
      },
    });
  } catch (error) {
    next(error);
  }
});
