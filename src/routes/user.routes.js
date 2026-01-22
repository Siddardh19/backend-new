import { Router } from "express";
import { 
    loginUser, 
    logoutUser, 
    registerUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails, 
    updateAvatar, 
    updateCoverImage, 
    getUserChannelProfile, 
    getWatchHistory } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser)

router.route("/login").post(loginUser)

//secured routes
router.route("/logout").post(verifyJWT, logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT, changeCurrentPassword)
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/update-account").patch(verifyJWT, updateAccountDetails) //Post changes all the values
router.route("/change-avatar").patch(verifyJWT, upload.single("avatar"), updateAvatar)
router.route("/change-coverImage").patch(verifyJWT, upload.single("coverImage"), updateCoverImage)

//We are taking values from params
router.route("/c/:username").get(verifyJWT, getUserChannelProfile)

router.route("/watch-history").get(verifyJWT, getWatchHistory)

export default router