import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video
    if(!title && !description) {
        throw new ApiError(400, "Title and description are required")
    } 
    
    //Get video and thumbnail local paths
    const videoLocalPath = req.files?.videoFile[0]?.path;
    
    //Thumbnail is optional
    let thumbnailLocalPath;
    if(req.files?.thumbnail) { // Check if thumbnail exists
        thumbnailLocalPath = req.files?.thumbnail[0]?.path;
    }
    
    if(!videoLocalPath) {
        throw new ApiError(400, "Video file is required")
    }
    
    //Upload to cloudinary
    const videoFile = await uploadOnCloudinary(videoLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if(!videoFile) {
        throw new ApiError(400, "Video file is required")
    }

    //Create video document
    const video = await Video.create({
         title,
         description,
         thumbnail: thumbnail.url,
         videoFile: videoFile.url
    })

    const createdVideo = await Video.findById(video._id).select(
         "-duration -views -isPublished -owner"
    )

    if(!createdVideo) {
        throw new ApiError("Something went wrong while uploading the video")
    }

    //return response
    return res
    .status(200)
    .json(
        new ApiResponse(200, createdVideo , "Video uploaded successfully")
    )
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}