import { Router } from 'express';
import { z } from 'zod';
import { updateUserPushToken } from '../lib/db.js';
import { authRequired } from '../middleware/authRequired.js';

export const devicesRoutes = Router();

devicesRoutes.use(authRequired);

const pushTokenSchema = z.object({
  token: z.string().trim().min(1, 'Informe o token de notificacao.'),
});

devicesRoutes.put('/push-token', async (req, res, next) => {
  try {
    const parsed = pushTokenSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados invalidos.' });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({ message: 'Usuario nao autenticado.' });
      return;
    }

    const user = await updateUserPushToken(req.user.id, parsed.data.token);
    res.json({
      data: {
        id: user.id,
        pushToken: user.pushToken ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});
