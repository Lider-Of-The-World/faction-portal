import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import membersRouter from "./members";
import operationsRouter from "./operations";
import eventSubmissionsRouter from "./event-submissions";
import tasksRouter from "./tasks";
import disciplineRouter from "./discipline";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import standardAssignmentsRouter from "./standard-assignments";
import notificationsRouter from "./notifications";
import auditLogsRouter from "./audit-logs";
import inactivityRequestsRouter from "./inactivity-requests";
import pointsRouter from "./points";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cronRouter);
router.use(authRouter);
router.use(membersRouter);
router.use(operationsRouter);
router.use(eventSubmissionsRouter);
router.use(standardAssignmentsRouter);
router.use(tasksRouter);
router.use(disciplineRouter);
router.use(dashboardRouter);
router.use(storageRouter);
router.use(notificationsRouter);
router.use(auditLogsRouter);
router.use(inactivityRequestsRouter);
router.use(pointsRouter);

export default router;
