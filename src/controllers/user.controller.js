import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/apiResponse.js"
import jwt from "jsonwebtoken";

import fs from "fs"
import { subscribe } from "diagnostics_channel";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({
            validateBeforeSave: false
        })

        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating tokens !!")
    }
}
const registerUser = asyncHandler(async (req,res)=>{
    // get user details from frontend
    const {email,username,fullname,password} = req.body
    // validation
    if([fullname,email,password,username].some((field)=>field?.trim()==="")){
        throw new ApiError(400,"All fields are required !!")
    }
    // check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    } 

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required !!");
    }
    // check if user already exists
    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })

    if(existedUser){
        fs.unlinkSync(avatarLocalPath);
        fs.unlinkSync(coverImageLocalPath);
        throw new ApiError(409,"User already registered !!")
    }
    // upload images to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400,"Coudn't upload avatar to Cloud !!");
    }
    // create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    // remove password and refresh token field
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    // check for user creation
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering !!")
    }
    // return response
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User Registered Successfully !!")
    );
})

export {registerUser}

const loginUser = asyncHandler(async (req,res)=>{
    // extract data from res body
    const {username,email,password} = req.body
    // check if username or email is provided
    if (!username && !email){
        throw new ApiError(400,"Username or Email is required !!")
    }
    // find the user
    const user = await User.findOne({
        $or: [{username},{email}]
    })
    // if user exists ?
    if(!user){
        throw new ApiError(404,"User doesn't exist !!")
    }
    // password check
    const isPasswordCorrect = await user.isPasswordCorrect(password);
    if(!isPasswordCorrect){
        throw new ApiError(401,"Password is invalid !!")
    }
    // access and refresh token generation
    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);
    // send cookies
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",refreshToken,options)
        .json(
            new ApiResponse(200,{
                user: loggedInUser, 
                    accessToken, 
                    refreshToken
            },
            "User logged in Successfully !!"
        )
    )
})

export {loginUser}

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(req.user._id,{
        $set: {
            refreshToken: null
        }
    },{
        new: true
    })

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .clearCookie("accessToken",options)
        .clearCookie("refreshToken",options)
        .json(new ApiResponse(200,{},"User logged out successfully !!"))
})

export {logoutUser}

const refreshAccessToken = asyncHandler(async (req,res)=>{
    try {
        const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if(!incomingRefreshToken){
            throw new ApiError(401,"Unauthorized request !!")
        }
    
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user){
            throw new ApiError(401,"Invalid Refresh Token !!")
        }
    
        if (incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired or used !!")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res.status(200)
            .cookie("accessToken",accessToken,options)
            .cookie("refreshToken",refreshToken,options)
            .json(
                new ApiResponse(200,{
                    accessToken,refreshToken
                },"Access token refreshed successfully !!")
            )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token !!")
    }
})

export {refreshAccessToken}

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword,newPassword} = req.body

    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"Invalid Password !!");
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res.status(200)
        .json(
            new ApiResponse(200,{},'Password changed sucessfully !!')
        )
})

export {changeCurrentPassword}

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res.status(200)
        .json(
            new ApiResponse(200,req.user,"Current user fetched successfully !!")
        )
})

export {getCurrentUser}

const updateAccountDetails = asyncHandler(async (req,res)=> {
    const {fullname,email} = req.body

    if(!fullname && !email){
        throw new ApiError(400,"All fields are required !!")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,{
        $set: {
            fullname: fullname,
            email: email,
        }
    },{new: true}).select("-password")

    return res.status(200)
        .json(new ApiResponse(200,user,"Account details updated successfully !!"))
})

export {updateAccountDetails}

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing !!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar){
        throw new ApiError(500,"Error while uploading on cloud !!")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,{
        $set: {
            avatar: avatar.url
        }
    },{new:true}).select("-password")

    return res.status(200)
        .json(
            new ApiResponse(200,user,"Avatar Image Updated Successfully !!")
        )
})

export {updateUserAvatar}

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover Image file is missing !!")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage){
        throw new ApiError(500,"Error while uploading on cloud !!")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,{
        $set: {
            coverImage: coverImage.url
        }
    },{new:true}).select("-password")

    return res.status(200)
        .json(
            new ApiResponse(200,user,"Cover Image Updated Successfully !!")
        )
})

export {updateUserCoverImage}

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const {username} = req.params

    if(!username?.trim()){
        throw new ApiError(400,"User name is missing !!")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                subscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"Channel doesn't exists !!")
    }

    return res.status(200)
        .json(
            new ApiResponse(200,channel[0],"User channel fetched successfully !!")
        )
})

export {getUserChannelProfile}

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(
                    req.user._id
                )
            },
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200)
        .json(
            new ApiResponse(200,user[0].watchHistory,"Watch History Fetched Successfully !!")
        )
})

export {getWatchHistory}