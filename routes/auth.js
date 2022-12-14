require('dotenv').config();
const express = require('express');
const router = express.Router();
const passport = require("passport");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const {Strategy: GoogleStrategy} = require('passport-google-oauth20')
const {Strategy: NaverStrategy} = require("passport-naver");
const AppleStrategy = require("passport-apple");
const path = require("path");
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./src/database/user.db');

router.use(cookieParser());
router.use(session({secret: process.env.NAVER_CLIENT_ID, resave: false, saveUninitialized: false}));
router.use(passport.initialize(undefined));
router.use(passport.session(undefined));

passport.use('apple',
    new AppleStrategy({
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        callbackURL: process.env.CALLBACK_URL + "/auth/callback/apple",
        keyID: process.env.APPLE_KEY_ID,
        privateKeyLocation: path.join(__dirname, `../src/AuthKey_${process.env.APPLE_KEY_ID}.p8`),
        passReqToCallback: true
    }, function (req, accessToken, refreshToken, idToken, profile, cb) {
        cb(null, jwt.decode(idToken));
    }));

router.use(session({secret: process.env.NAVER_CLIENT_SECRET, resave: false, saveUninitialized: false}));
passport.use('naver',
    new NaverStrategy({
            clientID: process.env.NAVER_CLIENT_ID,
            clientSecret: process.env.NAVER_CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL + "/auth/callback/naver"
        },
        function (accessToken, refreshToken, profile, done) {
            profile.accessToken = accessToken;
            profile.refreshToken = refreshToken;
            done(null, profile);
        }
    ));


router.use(session({secret: process.env.GOOGLE_CLIENT_SECRET, resave: false, saveUninitialized: false}));
passport.use('google',
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL + "/auth/callback/google",
            passReqToCallback: true,
        },
        function (request, accessToken, refreshToken, profile, done) {
            profile.accessToken = accessToken;
            profile.refreshToken = refreshToken;
            return done(null, profile);
        }
    )
);

passport.serializeUser(async function (user, done) {
    await db.get('SELECT * FROM user WHERE id = ?', [user.id], async (err, data) => {
        if (!data) {
            await db.run(`INSERT INTO user VALUES (?, ?, ?)`, user.id ? [user.id, user.provider, null] :
                [user.sub, "apple", null], (err) => {
                if (!err) {
                    user["first"] = true;
                    done(null, user);
                }
            })
        } else {
            user["first"] = false;
            done(null, user);
        }
    });
});

passport.deserializeUser(function (user, done) {
    done(null, user);
});

router.get('/auth/login/apple', passport.authenticate('apple'));
router.post("/auth/callback/apple",
    passport.authenticate('apple', {failureRedirect: '/'}, null),
    async (req, res) => {
        const token = jwt.sign({id: req.user.sub}, process.env.JWT_SECRET);
        res.cookie('token', token, {httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7});
        res.redirect('/mypage');
    });
router.get("/auth/callback/apple", (req, res) => {
    res.redirect('/mypage');
});

router.get('/auth/login/naver', passport.authenticate('naver'));
router.get('/auth/callback/naver',
    passport.authenticate('naver', {failureRedirect: '/'}, null),
    async (req, res) => {
        const token = jwt.sign({id: req.user.id}, process.env.JWT_SECRET);
        res.cookie('token', token, {httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7});
        res.redirect('/mypage');
    });

router.get('/auth/login/google', passport.authenticate('google', {scope: ['profile']}, null));
router.get('/auth/callback/google',
    passport.authenticate('google', {failureRedirect: '/'}, null),
    async (req, res) => {
        const token = jwt.sign({id: req.user.id}, process.env.JWT_SECRET);
        res.cookie('token', token, {httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7});
        res.redirect('/mypage');
    });


const isLoggedIn = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err) => {
        if (err) return res.sendStatus(401);
        next();
    });
}

router.post('/api/profile/set', isLoggedIn, async (req, res) => {
    const {clientId, image} = req.body;
    await db.run(`UPDATE user SET profile = ? WHERE id = ?`, [image, clientId], (err) => {
        if (err) {
            res.sendStatus(404);
        } else {
            res.sendStatus(200);
        }
    })
})

router.get('/api/auth', async (req, res) => {
    if (req.session && req.user) {
        await db.get(`SELECT * FROM user WHERE id = ?`, [req.user.id ? req.user.id : req.user.sub], (err, row) => {
            if (err) {
                res.sendStatus(404);
            } else {
                req.user["status"] = 200;
                req.user["profile"] = row && row.profile ? row.profile : "default";
                res.json(req.user);
            }
        })
    } else res.json({status: 401});
});

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    })
})

module.exports = router;