import { Router, type IRouter } from "express";
import booksRouter from "./books";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(booksRouter);

export default router;
