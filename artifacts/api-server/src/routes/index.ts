import { Router, type IRouter } from "express";
import healthRouter from "./health";
import keysRouter from "./keys";
import adminRouter from "./admin";
import photosRouter from "./photos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(keysRouter);
router.use(adminRouter);
router.use(photosRouter);

export default router;
