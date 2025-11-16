package main

import "core:fmt"
import "core:net"
import "core:strings"

generate_html :: proc() -> string {
    productions := get_productions()
    news_items := get_news()
    
    // Generate productions HTML
    productions_html := ""
    for production in productions {
        status_class := production.status == "upcoming" ? "upcoming" : "past"
        button_text := production.status == "upcoming" ? "Learn More" : "Read About"
        
        productions_html = fmt.tprintf(`%s
                    <div class="card %s">
                        <h3>%s</h3>
                        <p class="date">%s</p>
                        <p>%s</p>
                        <a href="#contact" class="btn">%s</a>
                    </div>`, 
            productions_html, status_class, production.title, production.date, 
            production.description, button_text)
    }
    
    // Generate news HTML
    news_html := ""
    for news_item in news_items {
        news_html = fmt.tprintf(`%s
                    <div class="card">
                        <h3>%s</h3>
                        <p class="date">%s</p>
                        <p>%s</p>
                    </div>`, 
            news_html, news_item.title, news_item.date, news_item.content)
    }

    return fmt.tprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Duchy Opera</title>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="#" class="logo">Duchy Opera</a>
                <nav>
                    <ul>
                        <li><a href="#home" class="active">Home</a></li>
                        <li><a href="#about">About</a></li>
                        <li><a href="#productions">Productions</a></li>
                        <li><a href="#news">News</a></li>
                        <li><a href="#auditions">Auditions</a></li>
                        <li><a href="#support">Support</a></li>
                        <li><a href="#contact">Contact</a></li>
                    </ul>
                </nav>
            </div>
        </div>
    </header>

    <main>
        <section id="home" class="page-header">
            <div class="container">
                <h1>Welcome to Duchy Opera</h1>
                <p>A vibrant community opera company bringing exceptional performances to our local community</p>
                <a href="#productions" class="btn">View Our Productions</a>
            </div>
        </section>

        <section id="about">
            <div class="container">
                <h2>About Duchy Opera</h2>
                <p>
                    Duchy Opera is a passionate community opera company dedicated to bringing world-class operatic performances to our region. Our talented cast and crew work together to create memorable experiences that celebrate the beauty and drama of opera.
                </p>
                
                <div class="grid">
                    <div class="card">
                        <h3>Our Mission</h3>
                        <p>To make opera accessible and enjoyable for audiences of all ages while providing opportunities for local talent to shine.</p>
                    </div>
                    <div class="card">
                        <h3>Community Focus</h3>
                        <p>We believe in the power of community and work to involve local artists, musicians, and volunteers in every production.</p>
                    </div>
                    <div class="card">
                        <h3>Excellence</h3>
                        <p>We strive for the highest standards in every aspect of our performances, from vocals to staging to costumes.</p>
                    </div>
                </div>
            </div>
        </section>

        <section id="productions">
            <div class="container">
                <h2>Our Productions</h2>
                <p>Discover our current and upcoming opera productions, featuring both beloved classics and exciting new works.</p>
                <div class="grid">
                    %s
                </div>
            </div>
        </section>

        <section id="news">
            <div class="container">
                <h2>Latest News</h2>
                <p>Stay updated with the latest happenings at Duchy Opera, from audition announcements to behind-the-scenes insights.</p>
                <div class="grid">
                    %s
                </div>
            </div>
        </section>

        <section id="auditions">
            <div class="container">
                <h2>Join Our Company</h2>
                <p>
                    Are you passionate about opera? We welcome singers, musicians, and volunteers to join our community. Whether you're an experienced performer or just starting your journey, there's a place for you at Duchy Opera.
                </p>
                
                <div class="grid">
                    <div class="card">
                        <h3>Performers</h3>
                        <p>Auditions for our upcoming productions. All voice types welcome.</p>
                        <a href="#contact" class="btn">Audition Info</a>
                    </div>
                    <div class="card">
                        <h3>Musicians</h3>
                        <p>Join our orchestra and be part of bringing these beautiful scores to life.</p>
                        <a href="#contact" class="btn">Join Orchestra</a>
                    </div>
                    <div class="card">
                        <h3>Volunteers</h3>
                        <p>Help with costumes, sets, marketing, and more. Every contribution matters.</p>
                        <a href="#contact" class="btn">Volunteer</a>
                    </div>
                </div>
            </div>
        </section>

        <section id="support">
            <div class="container">
                <h2>Support Duchy Opera</h2>
                <p>
                    Help us continue bringing exceptional opera to our community. Your support makes our performances possible and helps us grow our impact.
                </p>
                
                <div class="grid">
                    <div class="card">
                        <h3>Become a Patron</h3>
                        <p>Join our community of supporters and receive exclusive benefits and behind-the-scenes access.</p>
                        <a href="#contact" class="btn">Learn More</a>
                    </div>
                    <div class="card">
                        <h3>Corporate Sponsorship</h3>
                        <p>Partner with us to support the arts in our community while gaining valuable exposure.</p>
                        <a href="#contact" class="btn">Sponsor Us</a>
                    </div>
                </div>
            </div>
        </section>

        <section id="contact">
            <div class="container">
                <h2>Get In Touch</h2>
                <p>
                    We'd love to hear from you! Whether you're interested in attending a performance, joining our company, or supporting our mission, please reach out.
                </p>
                
                <div class="grid">
                    <div class="card">
                        <h3>Contact Information</h3>
                        <p><strong>Email:</strong> info@duchyopera.co.uk</p>
                        <p><strong>Phone:</strong> Coming soon</p>
                        <p><strong>Address:</strong> Details to be announced</p>
                    </div>
                    <div class="card">
                        <h3>Follow Us</h3>
                        <p>Stay updated with our latest news and announcements through our social media channels and mailing list.</p>
                        <a href="mailto:info@duchyopera.co.uk" class="btn">Join Mailing List</a>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <div class="container">
            <p>&copy; 2024 Duchy Opera. All rights reserved.</p>
            <p>Bringing exceptional opera to our community.</p>
        </div>
    </footer>

    <script>
        // Simple smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Update active nav link on scroll
        window.addEventListener('scroll', () => {
            const sections = document.querySelectorAll('section[id]');
            const navLinks = document.querySelectorAll('nav a');
            
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (scrollY >= (sectionTop - 200)) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + current) {
                    link.classList.add('active');
                }
            });
        });
    </script>
</body>
</html>`, productions_html, news_html)
}

main :: proc() {
    fmt.printf("Starting Duchy Opera server with sample data...\n")

    endpoint := net.Endpoint{
        address = net.IP4_Address{127, 0, 0, 1},
        port = 3000,
    }

    socket, socket_err := net.listen_tcp(endpoint)
    if socket_err != nil {
        fmt.printf("Failed to create socket: %v\n", socket_err)
        return
    }
    defer net.close(socket)

    fmt.printf("Server running on http://localhost:%d\n", endpoint.port)

    for {
        client, _, accept_err := net.accept_tcp(socket)
        if accept_err != nil {
            fmt.printf("Failed to accept connection: %v\n", accept_err)
            continue
        }

        handle_request(client)
        net.close(client)
    }
}

