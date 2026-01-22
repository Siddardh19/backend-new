import asyncHandler from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { use } from "react";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
     try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        
        //Save refresh token in database
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

     } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
     }
}

const registerUser = asyncHandler( async (req, res) => {

    //get user details from frontend
    const { username, email, fullName, password } = req.body;
    console.log("Received data:", { username, email, fullName });

    //validation - not empty
    if(
        [fullName, email, username, password].some((field)=> 
         field?.trim() === "" )
    ) {
         throw new ApiError(400, "All fields are required")
    }
    console.log("Checking for existing user with:", { username, email });

    //check if user already exists: username, email
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    console.log("Existing user found:", existedUser);

    if(existedUser) {
        //throw new ApiError(409, "User with email or username already exists")
        const conflictField = existedUser.email === email ? 'email' : 'username';
        const conflictValue = existedUser.email === email ? email : username;
        throw new ApiError(409, `User with ${conflictField} '${conflictValue}' already exists`)
    }

    //check for images, check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;
    
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    //upload them to cloudinary -> avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
    
    //create user object - create entry in db
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    //Check if the user is null or empty
    //remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    
    //check for if user created or not
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }
    
    //return response
    return res.status(201).json(
          new ApiResponse(200, createdUser, "User registered Successfully")
          
    )


})

const loginUser = asyncHandler( async(req, res) => {
      
      
      // req body -> data
      const {email, username, password} = req.body
      
      // username or email
      if(!username && !email) {
           throw new ApiError(400, "username or email is required")
      }

      // find the user
      const user = await User.findOne({
         $or: [{ username }, { email }]
      })

      if(!user) {
        throw new ApiError(404, "user does not exist")
      }

      //If the user is found
      // password check
      const isPasswordValid = await user.isPasswordCorrect(password)

      if(!isPasswordValid) {
         throw new ApiError(401, "Invalid user credentials")
      }

      // access and refresh token
      const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)
      
      //Send data to user
      const loggedInuser = await User.findById(user._id).select("-password ")
      // send cookie
      
      const options = {
          httpOnly: true,
          secure: true
      }

      return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
          new ApiResponse(
              200,
              {
                   user: loggedInuser, accessToken, refreshToken
              },
              "User logged In Successfully"
          )
      )    
})

const logoutUser = asyncHandler(async(req, res) => {
     await User.findByIdAndUpdate(
         req.user._id,
         {
            $set: {
                refreshToken: undefined
            }
         },
         {
            new: true
         }
     )

     const options = {
          httpOnly: true,
          secure: true
      }

      return res 
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async(req, res) => {
      //Acccess refresh token from user through cookies
      const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

      if(!incomingRefreshToken) {
          throw new ApiError(200, "Unauthorized request")
      }

      //Verify the expiration and converts the encrypted token to raw token
      try {
            const decodedToken = jwt.verify(
                incomingRefreshToken,
                process.env.REFRESH_TOKEN_SECRET
            )
    
            //Finding the user through the id of the decoded raw refresh token
            const user = await User.findById(decodedToken?._id)
            
            if(!user) {
                throw new ApiError(401, "Invalid refresh Token")
            }
    
            //Verify incoming token(Such that it matches with the refresh token saved in database)
    
            if(incomingRefreshToken !== user.refreshToken) {
                throw new ApiError(401, "Refresh token is expired or used")
            }
    
            //To send tokens to user in cookies
            const options = {
                httpOnly: true,
                secure: true
            }
    
            //If tokens match then return new generated access and refresh tokens
            const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
            return res 
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {accessToken, refreshToken:newRefreshToken },
                    "Access Token refreshed"
                )
            )
         } catch (error) {
           throw new ApiError(401, error?.message || "Invalid refresh Token")
      }
})

const changeCurrentPassword = asyncHandler(async(req, res) => {
    //getting passwords from the user through frontend 
    const {oldPassword, newPassword, confirmNewPassword } = req.body
    
    //If both new passwords do not match
    if(newPassword !== confirmNewPassword) {
        throw new ApiError(400, "Password doesn't match")
    }

    //Get user from database
    const user = await User.findById(req.user?._id)

    //Check if old password is correct and matches with the password in database
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    //Update with new password
    user.password=newPassword
    //Save the user with new password
    await user.save({validateBeforeSave: false})

    //Send response to user
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "User fetched successfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
      const { fullName, email } = req.body
      
      if(!fullName || !email) {
         throw new ApiError(400, "All fields are required")
      }

      const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        { new: true}
    ).select("-password")
    
    return res
    .status(200)
    .json( new ApiResponse(200, user, "Account details updated successfully"))
})

const updateAvatar = asyncHandler(async(req, res) => {
     const avatarLocalPath = req.file?.path

     if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
     }

     const avatar = await uploadOnCloudinary(avatarLocalPath)

     if (!avatar.url) {
        throw new ApiError("Error while uploading the avatar")
     }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true}
     ).select("-password")

     return res
     .status(200)
     .json(
        new ApiResponse(200, user, "Avatar updated successfully")
     )
})

const updateCoverImage = asyncHandler(async(req, res) => {
     const coverImageLocalPath = req.file?.path

     if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is missing")
     }

     const coverImage = await uploadOnCloudinary(coverImageLocalPath)

     if (!coverImage.url) {
        throw new ApiError("Error while uploading the Cover Image")
     }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true}
     ).select("-password")

     return res
     .status(200)
     .json(
        new ApiResponse(200, user, "Cover Image updated successfully")
     )
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    
    //To get the username of the channel, that we are looking for
    const {username} = req.params //params gets "username" from url

    //If there doesn't exists such user
    if(!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    //Using aggregation pipelines to count the no of documents
    const channel = await User.aggregate([
        {
            //To match the documents with the given "username"
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            //To look for subscribers of a channel
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            //To look for how many channels the "username" has subscribed
            $lookup: {
                from: "subscriptions", //database model name
                localField: "_id", //channel id
                foreignField: "subscriber", //to match with subscriber field in subscription model
                as: "subscribedTo" //alias
            }
        },
        {
            $addFields: {
                //To count the no of subscribers
                subscribersCount: {
                    $size: "$subscribers"
                },
                //To count the no of channels, we've subscribed to 
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                //To show whether we subscribed to that channel or not
                isSubscribed: {
                    $cond: {
                        //To find whether our user id exists in the subscribers list of that channel 
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                email: 1
            }
        }
    ])
    
    if(!channel?.length) {
        throw new ApiError(404, "channel does not exists")
    }
    
    return res 
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully" )
    )
}) 

const getWatchHistory = asyncHandler(async(req, res) => {

    const user = await User.aggregate([

        //To match the documents with the given _id
        {
            $match: {
                 //To get the string along with object Id -> coz mongoose doesn't interferes during aggregation
                _id: new mongoose.Types.ObjectId 
            }
        },
        //To get the "watchHistory" from "videos" to "users"
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory", //Currently we are in user
                foreignField: "_id",
                as: "watchHistory",
                //Since "owner"(users) is another data model in the "videos" data model -> So we bring the owner(users) seperately using nested pipeline
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            //To give only selected values from the owner
                            pipeline: [
                                {
                                   $project: {
                                       fullName: 1,
                                       username: 1,
                                       avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    //To get the first value from the array which we got from owner
                    {
                        $addFields: {
                              owner: {
                                  $first: "$owner" //To remove from field
                              }
                        }
                    }
                ]
            }
        },
    
    ])

    return res
    .status(200)
    .json(
       new ApiResponse(
            200, 
            user[0].watchHistory,
            "watch history fetched successfully"
      )
    )
}) 

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateAvatar,
    updateCoverImage
}