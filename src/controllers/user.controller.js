import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/apiResponse.js"
import fs from "fs"

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